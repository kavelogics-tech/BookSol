import requests
import json
from fastapi.responses import StreamingResponse
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pymongo import MongoClient
from bson import ObjectId
from bson.errors import InvalidId
import os
from dotenv import load_dotenv
import requests
import re
from typing import Optional
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address

# Load environment variables
load_dotenv()

app = FastAPI(title="BookSol PDF Q&A", version="8.0")

# Rate limiter
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# MongoDB connection
client = MongoClient(os.getenv("MONGO_URL"))
db = client["BookSol"]
files_collection = db["files"]

# Ollama configuration
OLLAMA_API_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "llama3"

# Supported languages with their codes
SUPPORTED_LANGUAGES = {
    "english": "English",
    "urdu": "Urdu",
    "spanish": "Spanish",
    "french": "French",
    "arabic": "Arabic",
    "hindi": "Hindi",
    "german": "German",
    "chinese": "Chinese",
    "russian": "Russian"
}

class QueryRequest(BaseModel):
    document_id: str
    question: str
    language: Optional[str] = None  # Now optional since we'll auto-detect

class UploadRequest(BaseModel):
    document_id: str
    language: Optional[str] = "english"  # Default to English

class APIResponse(BaseModel):
    status: str
    message: str
    data: dict = None
    error: str = None

def clean_pdf_text(text: str) -> str:
    """Clean and normalize PDF text content"""
    if not text:
        return ""
    
    # Remove multiple spaces, newlines
    text = re.sub(r'\s+', ' ', text)
    # Remove special characters but keep basic punctuation
    text = re.sub(r'[^\w\s.,;?!-]', '', text)
    return text.strip()

def extract_relevant_topics(context: str) -> list:
    """Extract potential topics from document content"""
    # Find capitalized phrases (potential topics)
    topics = list(set(re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b', context[:1000])))
    # Filter out common non-topics
    common_words = {"The", "And", "This", "That", "With", "For"}
    return [t for t in topics[:5] if t not in common_words]

def get_relevant_chunks(context: str, question: str) -> str:
    """Extract most relevant parts of document for the question"""
    sentences = context.split('.')
    question_words = set(question.lower().split())
    relevant = [
        s for s in sentences 
        if any(re.search(r'\b' + re.escape(w) + r'\b', s.lower()) 
        for w in question_words)
    ]
    return ' '.join(relevant[:10]) if relevant else context[:2000]

def detect_language(text: str) -> str:
    """Detect the language of the input text"""
    try:
        # Simple keyword-based detection for common languages
        text_lower = text.lower()
        
        if any(word in text_lower for word in ["हिंदी", "हिन्दी", "hindi"]):
            return "hindi"
        elif any(word in text_lower for word in ["اردو", "urdu"]):
            return "urdu"
        elif any(word in text_lower for word in ["español", "spanish"]):
            return "spanish"
        elif any(word in text_lower for word in ["français", "french"]):
            return "french"
        elif any(word in text_lower for word in ["العربية", "arabic"]):
            return "arabic"
        elif any(word in text_lower for word in ["deutsch", "german"]):
            return "german"
        elif any(word in text_lower for word in ["中文", "chinese"]):
            return "chinese"
        elif any(word in text_lower for word in ["русский", "russian"]):
            return "russian"
        
        # Check for "in <language>" or "answer in <language>" patterns
        lang_match = re.search(r'(answer|respond|give)\s+(?:me\s+)?(?:the\s+)?(?:answer\s+)?in\s+([a-z]+)', text_lower)
        if lang_match:
            lang = lang_match.group(2)
            if lang in SUPPORTED_LANGUAGES:
                return lang
        
        # Default to English if no specific language detected
        return "english"
    except:
        return "english"

def translate_response(response: str, target_language: str) -> str:
    """Translate the response to the target language using Ollama"""
    if target_language.lower() == "english":
        return response
    
    try:
        prompt = f"""
        Translate the following text to {SUPPORTED_LANGUAGES.get(target_language.lower(), target_language)}.
        Maintain the original meaning and context.
        Keep technical terms unchanged if no direct translation exists.
        
        TEXT TO TRANSLATE:
        {response}
        
        TRANSLATION:
        """
        
        translation = requests.post(
            OLLAMA_API_URL,
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.1,  # Lower temperature for more accurate translation
                    "num_ctx": 4096
                }
            },
            timeout=120
        )
        translation.raise_for_status()
        return translation.json().get("response", response).strip()
    except:
        return response  # Return original if translation fails

def get_language_specific_response(language: str, key: str) -> str:
    """Get language-specific responses for common messages"""
    responses = {
        "document_not_found": {
            "english": "Document not found",
            "urdu": "دستاویز نہیں ملی",
            "spanish": "Documento no encontrado",
            "french": "Document non trouvé",
            "arabic": "الوثيقة غير موجودة",
            "hindi": "दस्तावेज़ नहीं मिला",
            "german": "Dokument nicht gefunden",
            "chinese": "未找到文档",
            "russian": "Документ не найден"
        },
        "processing_started": {
            "english": "Document processing started",
            "urdu": "دستاویز کی پروسیسنگ شروع ہو گئی ہے",
            "spanish": "Procesamiento de documentos iniciado",
            "french": "Traitement du document commencé",
            "arabic": "بدأ معالجة المستند",
            "hindi": "दस्तावेज़ प्रसंस्करण शुरू हो गया",
            "german": "Dokumentverarbeitung gestartet",
            "chinese": "文档处理已开始",
            "russian": "Начата обработка документа"
        },
    }
    
    lang = language.lower()
    if lang not in SUPPORTED_LANGUAGES:
        lang = "english"
    
    return responses.get(key, {}).get(lang, responses.get(key, {}).get("english", ""))

def ask_ollama(question: str, context: str, language: str = None) -> str:
    """Get answer from locally running Ollama with multilingual support"""
    try:
        # Auto-detect language if not specified
        if language is None:
            language = detect_language(question)
        
        question_lower = question.lower()
        relevant_chunk = get_relevant_chunks(context, question)
        topics = extract_relevant_topics(context)
        
        # Language instruction based on detected or requested language
        lang_name = SUPPORTED_LANGUAGES.get(language.lower(), "English")
        language_instruction = f"\n\nRespond in {lang_name} language only."
        
        if "summary" in question_lower or "summarize" in question_lower:
            prompt = f"""
            Create a comprehensive summary of this document content in {lang_name}.
            Focus on key points, main ideas, and important details.
            Structure your response with clear paragraphs.
            Length: about 200-300 words.
            {language_instruction}

            DOCUMENT CONTENT:
            {context[:5000]}

            CONCISE DOCUMENT SUMMARY:
            """
        elif "table of content" in question_lower or "contents" in question_lower:
            prompt = f"""
            Extract and list the main sections or chapters from this document 
            in the format of a table of contents in {lang_name}.
            Include hierarchy if present.
            Format as a numbered list with section titles.
            {language_instruction}

            DOCUMENT CONTENT:
            {context[:5000]}

            TABLE OF CONTENTS:
            """
        else:
            prompt = f"""
            Answer this question based STRICTLY on the provided document content.
            Rules:
            1. If the answer isn't in the document, respond:
               "This question cannot be answered from the document. Please ask about: {', '.join(topics) if topics else 'the document content'}"
            2. For definitions, quote exact text when possible
            3. For numbers or lists, provide exact values from text
            4. Be precise and concise
            5. {language_instruction}

            RELEVANT DOCUMENT EXTRACTS:
            {relevant_chunk}

            QUESTION: {question}
            ANSWER:
            """
        
        response = requests.post(
            OLLAMA_API_URL,
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.3,
                    "num_ctx": 4096
                }
            },
            timeout=120
        )
        response.raise_for_status()
        
        answer = response.json().get("response", "No answer generated.").strip()
        
        # Post-process answer for better quality
        if "cannot be answered" in answer.lower() and topics:
            english_msg = f"This question cannot be answered from the document. Please ask about: {', '.join(topics)}"
            answer = translate_response(english_msg, language)
        
        return answer
    
    except requests.exceptions.ConnectionError:
        error_msg = "Error: Ollama service not running. Please ensure Ollama is running with 'ollama serve'."
        return translate_response(error_msg, language or "english")
    except Exception as e:
        error_msg = f"Error processing your question: {str(e)}"
        return translate_response(error_msg, language or "english")

@app.post("/upload", response_model=APIResponse)
async def upload_document(request: UploadRequest):
    """Endpoint called when a new document is uploaded"""
    try:
        document = files_collection.find_one({"_id": ObjectId(request.document_id)})
        if not document:
            return APIResponse(
                status="error",
                message=get_language_specific_response(request.language, "document_not_found"),
                error="DOCUMENT_NOT_FOUND"
            )
        
        return APIResponse(
            status="success",
            message=get_language_specific_response(request.language, "processing_started"),
            data={"document_id": request.document_id}
        )
    except InvalidId:
        return APIResponse(
            status="error",
            message=get_language_specific_response(request.language, "document_not_found"),
            error="INVALID_ID_FORMAT"
        )
    except Exception as e:
        return APIResponse(
            status="error",
            message=translate_response(f"Internal server error: {str(e)}", request.language),
            error=str(e)
        )

@app.post("/ask_query", response_model=APIResponse)
@limiter.limit("10/minute")

async def answer_question(request: Request, query: QueryRequest):
    """Endpoint to answer questions about a document"""
    try:
        try:
            doc_id = ObjectId(query.document_id)
        except:
            return APIResponse(
                status="error",
                message=get_language_specific_response("english", "document_not_found"),
                error="INVALID_ID_FORMAT"
            )

        document = files_collection.find_one({"_id": doc_id})
        if not document:
            return APIResponse(
                status="error",
                message=get_language_specific_response("english", "document_not_found"),
                error="DOCUMENT_NOT_FOUND"
            )

        raw_content = document.get("fileData", "")
        if not raw_content or len(raw_content) < 10:
            return APIResponse(
                status="error",
                message=translate_response("Document has no readable content", query.language or "english"),
                error="EMPTY_DOCUMENT"
            )

        context = clean_pdf_text(raw_content)
        
        # Use specified language or auto-detect
        language = query.language if query.language else detect_language(query.question)
        answer = ask_ollama(query.question, context, language)

        return APIResponse(
            status="success",
            message=translate_response("Question answered successfully", language),
            data={
                "answer": answer,
                "document_id": str(document["_id"]),
                "document_title": document.get("fileName", ""),
                "detected_language": language
            }
        )
    except Exception as e:
        return APIResponse(
            status="error",
            message=translate_response(f"Internal server error: {str(e)}", query.language or "english"),
            error=str(e)
        )


@app.post("/stream_query")
async def stream_query(request: Request, query: QueryRequest):
    """Endpoint to stream answers about a document"""
    try:
        try:
            doc_id = ObjectId(query.document_id)
        except:
            return {
                "status": "error",
                "message": get_language_specific_response("english", "document_not_found"),
                "error": "INVALID_ID_FORMAT"
            }

        document = files_collection.find_one({"_id": doc_id})
        if not document:
            return {
                "status": "error",
                "message": get_language_specific_response("english", "document_not_found"),
                "error": "DOCUMENT_NOT_FOUND"
            }

        raw_content = document.get("fileData", "")
        if not raw_content or len(raw_content) < 10:
            return {
                "status": "error",
                "message": translate_response("Document has no readable content", query.language or "english"),
                "error": "EMPTY_DOCUMENT"
            }

        context = clean_pdf_text(raw_content)
        language = query.language if query.language else detect_language(query.question)

        async def generate():
            try:
                # Prepare the prompt (same as in ask_ollama)
                relevant_chunk = get_relevant_chunks(context, query.question)
                topics = extract_relevant_topics(context)
                lang_name = SUPPORTED_LANGUAGES.get(language.lower(), "English")
                
                if "summary" in query.question.lower() or "summarize" in query.question.lower():
                    prompt = f"""
                    Create a comprehensive summary of this document content in {lang_name}.
                    Focus on key points, main ideas, and important details.
                    Structure your response with clear paragraphs.
                    Length: about 200-300 words.
                    Respond in {lang_name} language only.

                    DOCUMENT CONTENT:
                    {context[:5000]}

                    CONCISE DOCUMENT SUMMARY:
                    """
                elif "table of content" in query.question.lower() or "contents" in query.question.lower():
                    prompt = f"""
                    Extract and list the main sections or chapters from this document 
                    in the format of a table of contents in {lang_name}.
                    Include hierarchy if present.
                    Format as a numbered list with section titles.
                    Respond in {lang_name} language only.

                    DOCUMENT CONTENT:
                    {context[:5000]}

                    TABLE OF CONTENTS:
                    """
                else:
                    prompt = f"""
                    Answer this question based STRICTLY on the provided document content.
                    Rules:
                    1. If the answer isn't in the document, respond:
                       "This question cannot be answered from the document. Please ask about: {', '.join(topics) if topics else 'the document content'}"
                    2. For definitions, quote exact text when possible
                    3. For numbers or lists, provide exact values from text
                    4. Be precise and concise
                    5. Respond in {lang_name} language only.

                    RELEVANT DOCUMENT EXTRACTS:
                    {relevant_chunk}

                    QUESTION: {query.question}
                    ANSWER:
                    """

                # Stream from Ollama
                ollama_stream = requests.post(
                    OLLAMA_API_URL,
                    json={
                        "model": OLLAMA_MODEL,
                        "prompt": prompt,
                        "stream": True,  # Enable streaming
                        "options": {
                            "temperature": 0.3,
                            "num_ctx": 4096
                        }
                    },
                    stream=True
                )

                ollama_stream.raise_for_status()

                # Stream the response chunks
                full_response = ""
                for chunk in ollama_stream.iter_content(chunk_size=None):
                    if chunk:
                        try:
                            chunk_str = chunk.decode('utf-8')
                            json_chunk = json.loads(chunk_str)
                            response_part = json_chunk.get("response", "")
                            
                            if response_part:
                                full_response += response_part
                                yield json.dumps({
                                    "status": "streaming",
                                    "data": {
                                        "answer": response_part,
                                        "document_id": str(document["_id"]),
                                        "document_title": document.get("fileName", ""),
                                        "detected_language": language
                                    }
                                }) + "\n"
                        except json.JSONDecodeError:
                            continue

                # Post-process the full response if needed
                if "cannot be answered" in full_response.lower() and topics:
                    english_msg = f"This question cannot be answered from the document. Please ask about: {', '.join(topics)}"
                    full_response = translate_response(english_msg, language)
                    yield json.dumps({
                        "status": "success",
                        "data": {
                            "answer": full_response,
                            "document_id": str(document["_id"]),
                            "document_title": document.get("fileName", ""),
                            "detected_language": language
                        }
                    }) + "\n"

            except Exception as e:
                yield json.dumps({
                    "status": "error",
                    "message": translate_response(f"Error during streaming: {str(e)}", language),
                    "error": str(e)
                }) + "\n"

        return StreamingResponse(generate(), media_type="application/x-ndjson")

    except Exception as e:
        return {
            "status": "error",
            "message": translate_response(f"Internal server error: {str(e)}", query.language or "english"),
            "error": str(e)
        }
@app.get("/languages")
async def list_supported_languages():
    """Endpoint to list all supported languages"""
    return {
        "status": "success",
        "supported_languages": SUPPORTED_LANGUAGES,
        "default_language": "english"
    }

@app.get("/documents")
async def list_documents(language: str = "english"):
    """Endpoint to list all documents"""
    try:
        docs = list(files_collection.find({}, {"fileName": 1, "createdAt": 1}))
        for doc in docs:
            doc["_id"] = str(doc["_id"])
        return {
            "status": "success",
            "message": translate_response("Documents retrieved successfully", language),
            "data": docs
        }
    except Exception as e:
        return {
            "status": "error",
            "message": translate_response(f"Error retrieving documents: {str(e)}", language),
            "error": str(e)
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
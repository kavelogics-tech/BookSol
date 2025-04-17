import express from "express"
import Folder from "../models/folderModel.js";
import mongodb from "mongodb"
import jwt from "jsonwebtoken";
import { errorMessage, serverError, successMessage } from "../helpers/helperFuncs.js";
import { userExists, folderExists, userFolderAuth, validateUser } from "../middleware/authMiddleWare.js";
import User from "../models/userModel.js";
import multer from "multer";
import PdfParse from "pdf-parse";
import fs from "fs";
import File from "../models/fileModel.js";

const router = express.Router();

router.use(validateUser);
const upload = multer({ dest: 'uploads/' });

router.post('/testUpload', upload.single('file'), async (req, res) => {
    console.log("Start uploading");

    try {
        console.log("ok fine");
        res.send("djwdw");
    } catch (error) {
        console.log(`error: ${error}`);
        res.status(500).json({ message: "Error uploading file" });
    }
});

router.post('/upload', upload.single("file"), userExists, folderExists, userFolderAuth, async (req, res) => {
    // suppose file is uploaded and a url is generated
    console.log("start uploading");
    try {
        console.log(`end is ${req.body.folderId}`)
        const dataBuffer = fs.readFileSync(req.file.path);
        const data = await PdfParse(dataBuffer);

        const folderId = req.body.folderId;
        console.log(`again end is ${folderId}`)

        const newFile = new File({
            folderId: new mongodb.ObjectId(folderId),
            fileName: req.file.originalname,
            fileData: data.text,
            fileType: "Pdf"
        })

        const storedFile = await newFile.save();
        console.log(storedFile);

        // now add this file to file list of folder
        const updatedFolder = await Folder.findByIdAndUpdate(
            new mongodb.ObjectId(folderId),
            {
                $push: {
                    files: storedFile['_id']
                }
            }
        )

        const resp = await fetch("http://127.0.0.1:8000/upload", {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              "document_id": storedFile._id,
            })
        });
        
        console.log("got in the end");
        res.status(200).json(successMessage("file stored successfuly", [storedFile, updatedFolder]));
    } catch (error) {
        console.log(`error : ${error}`)
        res.status(500).json(serverError());
    }
});

router.delete('/delete/:fileId', userExists, async (req, res) => {
    try {
        const fileId = req.params.fileId;
        const userId = req.userId;
        console.log("user" + userId)
        console.log(`fileId = ${fileId}`)
        // Check if the file exists
        const file = await File.findById(fileId);
        if (!file) {
            return res.status(404).json(errorMessage("File not found"));
        }

        // Check if the user has permission to delete the file
        const folder = await Folder.findById(file.folderId);
        console.log("owner " + folder.owner)
        if (!folder || !folder.owner || folder.owner.toString() !== userId) {
            return res.status(403).json(errorMessage("Unauthorized"));
        }

        // Delete the file from the database
        await File.findByIdAndDelete(fileId);

        // Remove the file from the folder's file list
        await Folder.findByIdAndUpdate(folder._id, {
            $pull: {
                files: fileId
            }
        });

        res.status(200).json(successMessage("File deleted successfully"));
    } catch (error) {
        console.log(`error: ${error}`);
        res.status(500).json(serverError());
    }
});

router.post('/query', userExists, async (req, res) => {
    try {
      // Ensure we're forwarding the exact structure FastAPI expects
      const fastApiPayload = {
        document_id: req.body.document_id || req.body.documentId,
        question: req.body.question || req.body.query,
        language: req.body.language || 'en' // Add language parameter for TTS
      };
  
      console.log("Forwarding to FastAPI:", JSON.stringify(fastApiPayload, null, 2));
  
      const response = await fetch("http://127.0.0.1:8000/ask_query", {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(fastApiPayload)
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        console.error("FastAPI error:", errorData);
        return res.status(response.status).json(errorData);
      }
  
      const data = await response.json();
      res.status(200).json(successMessage("answered", [data]));
    } catch (error) {
      console.error("Proxy error:", error);
      res.status(500).json(serverError());
    }
});

router.post('/stream_query', userExists, async (req, res) => {
    try {
        // Forward the request to FastAPI streaming endpoint
        const fastApiPayload = {
            document_id: req.body.document_id || req.body.documentId,
            question: req.body.question || req.body.query,
            language: req.body.language || 'en' // Add language parameter for TTS
        };

        console.log("Forwarding to FastAPI streaming:", JSON.stringify(fastApiPayload, null, 2));

        // Set up headers for streaming response
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        // Proxy the FastAPI streaming response
        const response = await fetch("http://127.0.0.1:8000/stream_query", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(fastApiPayload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("FastAPI streaming error:", errorData);
            res.write(`data: ${JSON.stringify(errorData)}\n\n`);
            res.end();
            return;
        }

        // Stream the response from FastAPI to the client
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            // Forward each chunk to the client
            res.write(`data: ${chunk}\n\n`);
        }

        res.end();
    } catch (error) {
        console.error("Proxy streaming error:", error);
        res.write(`data: ${JSON.stringify({
            status: "error",
            message: "Error during streaming",
            error: error.message
        })}\n\n`);
        res.end();
    }
});

// Add new route for speech-to-text conversion
router.post('/stt', userExists, upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json(errorMessage("No audio file uploaded"));
        }

        // Here you would typically send the audio file to a speech-to-text service
        // For example, using Google Cloud Speech-to-Text, AWS Transcribe, etc.
        // This is a placeholder implementation
        
        // In a real implementation, you would:
        // 1. Read the audio file
        // 2. Send it to your STT service
        // 3. Return the transcribed text
        
        // Mock response
        const mockTranscription = "This is a mock transcription of your audio";
        
        res.status(200).json(successMessage("Transcription successful", {
            text: mockTranscription
        }));
    } catch (error) {
        console.error("STT error:", error);
        res.status(500).json(serverError());
    }
});

export default router;
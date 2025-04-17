import React, { useState, useRef, useEffect } from "react";
import { Button, Input, Badge, Card, CardBody } from "@windmill/react-ui";
import {
  MessageCircle,
  MicIcon,
  MicOffIcon,
  Volume2,
  VolumeX,
  Volume,
  SaveIcon,
  StopCircle,
} from "lucide-react";
import PageTitle from "../Typography/PageTitle";
import { useLocation, useParams } from "react-router-dom";
import axios from "axios";
import SaveChatModal from "../Modals/saveChatModal";

function Chat() {
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cname, setCname] = useState("");
  const [page, setPage] = useState(10);
  const [currentStream, setCurrentStream] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef(null);
  const speechRecognition = useRef(null);
  const speechSynthesis = useRef(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isVoiceQuestion, setIsVoiceQuestion] = useState(false);
  const [volumeStates, setVolumeStates] = useState({});
  const { fileId } = useParams();
  const location = useLocation();

  // Initialize speech recognition and synthesis
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      speechRecognition.current = new SpeechRecognition();
      speechRecognition.current.continuous = false;
      speechRecognition.current.interimResults = false;
      speechRecognition.current.lang = "en-US";

      speechRecognition.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setMessage(transcript);
        setIsListening(false);
        setIsVoiceQuestion(true);
      };

      speechRecognition.current.onerror = (event) => {
        console.error("Speech recognition error", event.error);
        setIsListening(false);
      };
    }

    speechSynthesis.current = window.speechSynthesis;

    return () => {
      if (speechRecognition.current) {
        speechRecognition.current.abort();
      }
      if (speechSynthesis.current) {
        speechSynthesis.current.cancel();
      }
    };
  }, []);

  // handle the save chat modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  function openModal() {
    setIsModalOpen(true);
  }
  function closeModal() {
    setIsModalOpen(false);
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Toggle voice input
  const toggleVoiceInput = () => {
    if (!speechRecognition.current) {
      alert("Speech recognition not supported in your browser");
      return;
    }

    if (isListening) {
      speechRecognition.current.stop();
      setIsListening(false);
    } else {
      speechRecognition.current.start();
      setIsListening(true);
      setIsVoiceQuestion(true);
    }
  };

 
  const toggleVolume = (index) => {
    const isCurrentlyOn = volumeStates[index];
    if (isCurrentlyOn) {
      // If currently on, turn off
      speechSynthesis.current.cancel();
      setVolumeStates((prev) => ({ ...prev, [index]: false }));
    } else {
      // If currently off, speak the message
      const message = chat[index].message;
      speakAnswer(message, index);
    }
  };

  // load chat message from backend
  const loadChat = async (chat_id) => {
    try {
      const payload = { chatId: chat_id };
      const response = await axios.post("/api/chat/fetchChat", payload, {
        withCredentials: true,
      });

      let chatMessages = response.data.payload[0].messages;
      for (let index in chatMessages) {
        chatMessages[index] = JSON.parse(chatMessages[index]);
      }
      setChat(chatMessages);
      setCname(response.data.payload[0].chatName);
    } catch (error) {
      console.log(error);
    }
  };

  // upload the chat to backend
  const hanleSaveChat = async (chatName) => {
    const { chatId } = location.state || {};
    try {
      const payload = chatId
        ? {
            chatName: chatName,
            chatMessages: chat,
            chatId: chatId,
          }
        : {
            chatName: chatName,
            fileId: fileId,
            chatMessages: chat,
          };

      const endpoint = chatId ? "/api/chat/updateChat" : "/api/chat/saveChat";
      const response = await axios.post(endpoint, payload, {
        withCredentials: true,
      });
      console.log(response);
      closeModal();
    } catch (error) {
      console.log(error);
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [chat]);

  useEffect(() => {
    const { chatId } = location.state || {};
    loadChat(chatId);
  }, [page]);

  // Cancel any ongoing stream when component unmounts
  useEffect(() => {
    return () => {
      if (currentStream) {
        currentStream.cancel();
      }
      if (speechRecognition.current) {
        speechRecognition.current.abort();
      }
      if (speechSynthesis.current) {
        speechSynthesis.current.cancel();
      }
    };
  }, []);

  async function sendMessage() {
    if (message.trim() === "") return;

    const isVoiceQ = isListening;
    const userMessage = {
      message,
      sender: "user",
      isVoiceQuestion: isVoiceQ,
    };

    setChat((prev) => [
      ...prev,
      userMessage,
      {
        message: "",
        sender: "server",
        loading: true,
        isVoiceQuestion: isVoiceQ,
      },
    ]);
    setMessage("");
    setIsListening(false);
    setIsStreaming(true); // Start streaming

    try {
      const abortController = new AbortController();
      setCurrentStream(abortController);

      const response = await fetch("/api/file/stream_query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          document_id: fileId,
          question: message,
        }),
        signal: abortController.signal,
        credentials: "include",
      });

      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      if (!response.body) throw new Error("ReadableStream not supported");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let serverResponse = "";
      let answerComplete = false;

      while (!answerComplete) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk
          .split("\n")
          .filter((line) => line.startsWith("data: "));

        for (const line of lines) {
          try {
            const data = JSON.parse(line.substring(6));

            if (data.status === "streaming" && data.data?.answer) {
              serverResponse += data.data.answer;
              setChat((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  message: serverResponse,
                  sender: "server",
                  loading: false,
                  isVoiceQuestion: isVoiceQ,
                };
                return updated;
              });
            } else if (data.status === "success") {
              answerComplete = true;
              setChat((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  message: serverResponse,
                  sender: "server",
                  loading: false,
                  isVoiceQuestion: isVoiceQ,
                };
                return updated;
              });

              // Only speak for voice questions
              if (isVoiceQ) {
                speakAnswer(serverResponse, chat.length + 1);
              }
            }
          } catch (e) {
            console.error("Error parsing stream chunk:", e);
          }
        }
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("Error:", error);
        setChat((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            message: "Error: " + (error.message || "Failed to get response"),
            sender: "server",
            loading: false,
            isVoiceQuestion: isVoiceQ,
          };
          return updated;
        });
      }
    } finally {
      setIsStreaming(false);
      setCurrentStream(null);
    }
  }

  const speakAnswer = (text, index) => {
    if (!speechSynthesis.current || isSpeaking || !text.trim()) return;

    speechSynthesis.current.cancel();
    setVolumeStates((prev) => ({ ...prev, [index]: "speaking" }));
    setIsSpeaking(true);

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = utterance.onerror = () => {
      setIsSpeaking(false);
      setVolumeStates((prev) => ({
        ...prev,
        [index]: prev[index] === "speaking" ? "completed" : prev[index],
      }));
    };

    speechSynthesis.current.speak(utterance);
  };

  // return (
  //   <div className="p-6 flex flex-col h-full">
  //     <div
  //       style={{
  //         display: "flex",
  //         justifyContent: "space-between",
  //         alignItems: "center",
  //       }}
  //     >
  //       <PageTitle>Chat</PageTitle>
  //       <Button onClick={openModal} size="large">
  //         Save Chat
  //       </Button>
  //       <SaveChatModal
  //         isModelOpen={isModalOpen}
  //         closeModal={closeModal}
  //         handleSaveChat={hanleSaveChat}
  //         chat_name={cname}
  //       />
  //     </div>

  //     <div
  //       className="flex flex-col space-y-4 p-3 bg-white dark:bg-gray-800 rounded shadow overflow-y-auto custom-scrollbar flex-grow"
  //       style={{ maxHeight: "70vh" }}
  //     >
  //       {chat.map((msg, index) => (
  //         <div
  //           key={index}
  //           className={`flex items-start ${
  //             msg.sender === "user" ? "justify-end" : ""
  //           }`}
  //         >
  //           <Card
  //             colored
  //             className={msg.sender === "user" ? "bg-gray-700" : "bg-gray-900"}
  //           >
  //             <CardBody className="flex-shrink min-w-0">
  //               {msg.loading ? (
  //                 <div className="flex items-center justify-center space-x-2">
  //                   <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
  //                   <span className="text-white">Loading...</span>
  //                 </div>
  //               ) : (
  //                 <>
  //                   <p
  //                     className="text-white overflow-auto whitespace-normal"
  //                     style={{ fontSize: "15px" }}
  //                   >
  //                     {msg.message}
  //                   </p>
  //                   <div className="flex justify-end mt-2">
  //                     {msg.sender === "server" && msg.message && (
  //                       <Button
  //                         layout="link"
  //                         size="icon"
  //                         aria-label="Toggle volume"
  //                         onClick={() => toggleVolume(index)}
  //                       >
  //                         {volumeStates[index] === "speaking" ? (
  //                           <Volume2 className="w-5 h-5 text-green-500" />
  //                         ) : volumeStates[index] === "completed" ? (
  //                           <VolumeX className="w-5 h-5 " />
  //                         ) : (
  //                           <VolumeX className="w-5 h-5" />
  //                         )}
  //                       </Button>
  //                     )}
                     
                      
  //                   </div>
  //                 </>
  //               )}
  //             </CardBody>
  //           </Card>
  //         </div>
  //       ))}
  //       <div ref={messagesEndRef} />
  //     </div>

  //     <div className="flex mt-4 sticky bottom-0 bg-white dark:bg-gray-800 p-6">
  //       <Input
  //         className="mr-2"
  //         placeholder="Type your message here..."
  //         value={message}
  //         onChange={(e) => setMessage(e.target.value)}
  //         onKeyPress={(e) => e.key === "Enter" && sendMessage()}
  //       />
  //       <Button onClick={sendMessage}>
  //         <MessageCircle className="w-5 h-5" />
  //       </Button>
  //       <Button
  //         className="ml-2"
  //         onClick={toggleVoiceInput}
  //         layout={isListening ? "outline" : "default"}
  //         aria-label={isListening ? "Stop listening" : "Start voice input"}
  //       >
  //         {isListening ? (
  //           <MicOffIcon className="w-5 h-5 text-red-500" />
  //         ) : (
  //           <MicIcon className="w-5 h-5" />
  //         )}
  //       </Button>
  //       {currentStream && (
  //         <Button
  //           className="ml-2"
  //           onClick={() => {
  //             currentStream.abort();
  //             setCurrentStream(null);
  //           }}
  //           layout="outline"
  //         >
  //           Stop
  //         </Button>
  //       )}
  //     </div>
  //   </div>
  // );
  
  return (
    <div className="flex flex-col h-full p-4 bg-gray-50 dark:bg-gray-900">
      <div className="flex justify-between items-center mb-6">
        <PageTitle className="text-2xl font-semibold text-gray-800 dark:text-white">
          {cname || "New Chat"}
        </PageTitle>
        <Button
          onClick={openModal}
          size="large"
          iconLeft={SaveIcon}
          className="bg-purple-600 hover:bg-purple-700 text-white flex items-center space-x-2"
        >
          <span>Save Chat</span>
        </Button>
        <SaveChatModal
          isModelOpen={isModalOpen}
          closeModal={closeModal}
          handleSaveChat={hanleSaveChat}
          chat_name={cname}
        />
      </div>

      {/* Chat Messages Area */}
      
      <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto mb-4 rounded-lg bg-white dark:bg-gray-800 shadow-sm px-4 py-32 custom-scrollbar ">
        {chat.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
            <MessageCircle className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-sm lg:text-lg mb-1">Start a conversation with your document</p>
            <p className="text-purple-400 text-sm">Type a message or use voice input</p>
          </div>
        ) : (
          chat.map((msg, index) => (
            <div
              key={index}
              className={`flex mb-4 ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
            >
              <Card
                // className={`max-w-3xl ${msg.sender === "user" ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white"}`}
                colored
              className={`max-w-3xl ${msg.sender === "user" ? "bg-blue-600 text-white dark:bg-blue-500" : "bg-gray-100 text-black dark:bg-gray-700 dark:text-white"}`}
              >
                <CardBody className="p-4">
                  {msg.loading ? (
                    <div className="flex items-center space-x-2">
                      <div className="animate-pulse flex space-x-2">
                        <div className="w-3 h-3 bg-blue-400 rounded-full"></div>
                        <div className="w-3 h-3 bg-blue-400 rounded-full"></div>
                        <div className="w-3 h-3 bg-blue-400 rounded-full"></div>
                      </div>
                      <span>Thinking...</span>
                    </div>
                  ) : (
                    <>
                      <div className="whitespace-pre-wrap text-sm md:text-base">
                        {msg.message}
                      </div>
                      {msg.sender === "server" && msg.message && (
                        <div className="flex justify-end mt-2">
                          <Button
                            layout="link"
                            size="icon"
                            aria-label="Toggle volume"
                            onClick={() => toggleVolume(index)}
                            className="text-gray-600 dark:text-gray-300 hover:text-blue-500 dark:hover:text-blue-400"
                          >
                            {volumeStates[index] === "speaking" ? (
                              <Volume2 className="w-5 h-5 animate-pulse text-blue-500" />
                            ) : volumeStates[index] ? (
                              <VolumeX className="w-5 h-5" />
                            ) : (
                              <Volume2 className="w-5 h-5" />
                            )}
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </CardBody>
              </Card>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      </div>

      {/* Input Area */}
      <div className="sticky bottom-0 bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-2">
          <Input
            className="flex-1"
            placeholder="Type your message here..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && sendMessage()}
          />
          <div className="flex space-x-2">
            <Button
              onClick={sendMessage}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              disabled={message.trim() === ""}
              aria-label="Send message"
            >
              <MessageCircle className="w-5 h-5" />
            </Button>
            <Button
              onClick={toggleVoiceInput}
              className={`${isListening ? "bg-red-100 hover:bg-red-200 text-red-600" : "bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-white"}`}
              aria-label={isListening ? "Stop listening" : "Start voice input"}
            >
              {isListening ? (
                <MicOffIcon className="w-5 h-5" />
              ) : (
                <MicIcon className="w-5 h-5" />
              )}
            </Button>
            {currentStream && (
              <Button
                onClick={() => {
                  currentStream.abort();
                  setCurrentStream(null);
                }}
                className="bg-red-100 hover:bg-red-200 text-red-600"
                aria-label="Stop generating"
              >
                <StopCircle className="w-5 h-5" />
              </Button>
            )}
          </div>
        </div>
        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          {isListening ? (
            <span className="flex items-center text-blue-600">
              <span className="relative flex h-3 w-3 mr-1">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-600"></span>
              </span>
              Listening...
            </span>
          ) : isStreaming ? (
            <span className="text-blue-600">Generating response...</span>
          ) : (
            "Press Enter to send"
          )}
        </div>
      </div>
    </div>
  );

}





export default Chat;

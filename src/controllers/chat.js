import {
  API_CHAT_RETRIEVERS,
  createChatEngine,
  fetchReviews,
  systemMessage,
} from "../utils/chatEngine.js";
import { findCarrierShipengineId } from "../utils/shipengineCarrier.js";
import extractDomain from "../utils/urlExtract.js";

let functionChatEngine; // Adjust the type as per the actual type returned by createChatEngine
let jsonChatEngine; // Adjust the type as per the actual type returned by createChatEngine
let simpleChatEngine; // Adjust the type as per the actual type returned by createChatEngine

// Initialize chatEngine once at startup
(async () => {
  console.log("Initializing chat engine...");
  functionChatEngine = await createChatEngine({ function_call: true });
  jsonChatEngine = await createChatEngine({ output_response_format: true });
  simpleChatEngine = await createChatEngine({});
  console.log("Chat engine initialized");
})();

export const handleChat = async (req, res) => {
  const { chatHistory, message } = req.body;

  if (!chatHistory || !message) {
    return res.status(400).json({ error: "Invalid request body" });
  }

  if (!functionChatEngine || !simpleChatEngine) {
    return res.status(500).json({ error: "Chat engine not initialized" });
  }

  let response = await jsonChatEngine.chat({
    message: message,
    chatHistory: [systemMessage, ...chatHistory],
  });

  // if (response.raw.choices[0].message?.function_call) {
  //   const carrierUrls = JSON.parse(
  //     response.raw.choices[0].message.function_call.arguments
  //   ).carrier_urls;

  //   const functionCallResponse = [];

  //   carrierUrls.forEach((carrierUrl) => {
  //     functionCallResponse.push({
  //       [carrierUrl]: fetchReviews(carrierUrl),
  //     });
  //   });

  //   chatHistory.push({
  //     role: "assistant",
  //     content: JSON.stringify({
  //       function_call: response.raw.choices[0].message.function_call,
  //     }),
  //   });

  //   chatHistory.push({
  //     role: "tool",
  //     content: JSON.stringify(functionCallResponse),
  //   });

  //   response = await (json ? jsonChatEngine : simpleChatEngine).chat({
  //     message: message,
  //     chatHistory: [systemMessage, ...chatHistory],
  //   });
  // }

  // const sources = [];

  // response.sourceNodes.forEach(({ node, score }) => {
  //   const existingSource = sources.find(
  //     (source) => source.url === node.metadata.url
  //   );

  //   if (existingSource) {
  //     // If URL already exists, update score if the current score is higher
  //     if (existingSource.score < score) {
  //       existingSource.score = score;
  //     }
  //   } else {
  //     // If URL does not exist, add it to the sources array
  //     if (node.metadata.url)
  //       sources.push({
  //         url: node.metadata.url,
  //         score: score,
  //       });
  //   }
  // });

  // // Sort sources by score in descending order
  // sources.sort((a, b) => b.score - a.score);

  const carriers = JSON.parse(response.message.content).carriers.map(
    ({ domainName, ...carrier }) => {
      const reviews = fetchReviews(domainName)
        .slice(0, 3)
        .map((review) => ({
          name: review.reviewer_name,
          rating: review.rating,
          review: review.review_content,
          url: review.review_link,
        }));

      const carrier_id = findCarrierShipengineId(domainName);
      
      return {
        ...carrier,
        reviews,
        isRatesAvailable: !!carrier_id,
      };
    }
  );

  return res.status(200).json({
    message: { carriers },
  });
};

export const handleCarrierChat = async (req, res) => {
  const { chatHistory, message, carrierName } = req.body;

  if (!chatHistory || !message || !carrierName) {
    return res
      .status(400)
      .json({ success: false, error: "Invalid request body" });
  }

  if (!simpleChatEngine) {
    return res
      .status(500)
      .json({ success: false, error: "Chat engine not initialized" });
  }

  const systemMessage = {
    role: "system",
    content: `You are a knowledgeable shipping assistant for all the shipping queries related to ${carrierName}.  Your primary goal is to provide clear, accurate, and contextually relevant answers to users' queries about shipping. Always ensure your responses are based on the data provided to you with most current shipping regulations and best practices. Strive for 99% accuracy in your responses, providing detailed explanations when necessary to enhance understanding. If a user requests links or additional resources, provide accurate and reliable links to support their inquiry. Pay close attention to terminology to avoid misunderstandings, and prioritize precision in all information provided. Additionally, please provide feedback on the responses you receive to help improve the assistance offered.`,
  };

  let response = await simpleChatEngine.chat({
    message: message,
    chatHistory: [systemMessage, ...chatHistory],
  });

  return res
    .status(200)
    .json({ success: true, message: response.message.content });
};

export const handleCarrierApiDocsChat = async (req, res) => {
  const { chatHistory, message, carrierUrl } = req.body;

  if (!chatHistory || !message || !carrierUrl) {
    return res
      .status(400)
      .json({ success: false, error: "Invalid request body" });
  }
  const uri = extractDomain(carrierUrl);
  const retriever = API_CHAT_RETRIEVERS.find((retriver) => retriver.carrier === uri);
  if (!retriever) {
    return res
      .status(404)
      .json({ success: false, error: `No API documentation found for carrier: ${uri}. Please make sure the carrier URL is correct and try again.` });
  }
  const chatEngine = new ContextChatEngine({
    retriever: retriever.retriever,
    chatModel: new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      model: "gpt-4o-mini",
    })
  });

  const systemMessage = {
    role: "system",
    content: `You are a knowledgeable shipping assistant for the shipping queries related to ${uri}.  Your primary goal is to provide clear, accurate, and contextually relevant answers to users' queries about shipping. Always ensure your responses are based on the data provided to you with most current shipping regulations and best practices. Strive for 99% accuracy in your responses, providing detailed explanations when necessary to enhance understanding. If a user requests links or additional resources, provide accurate and reliable links to support their inquiry. Pay close attention to terminology to avoid misunderstandings, and prioritize precision in all information provided. Additionally, please provide feedback on the responses you receive to help improve the assistance offered.`,
  };

  let response = await chatEngine.chat({
    message: message,
    chatHistory: [systemMessage, ...chatHistory],
  });

  return res
    .status(200)
    .json({ success: true, message: response.message.content });
};
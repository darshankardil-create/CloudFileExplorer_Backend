import { Server } from "socket.io";
import { InferenceClient } from "@huggingface/inference";
import { prompt } from "./prompt.js";

export default function socketconnection(instance) {
  try {
    const io = new Server(instance, {
      cors: {
        origins: ["*"],
      },
    });

    io.on("connection", (user) => {
      console.log(user.id);

      user.on("send", async (data) => {
        try {
          const client = await new InferenceClient(process.env.HF_TOKEN);

          const chatCompletion = await client.chatCompletion({
            model: "Qwen/Qwen3.6-27B:featherless-ai",
            messages: [
              {
                role: "system",
                content: prompt,
              },

              ...data.dataforai,
            ],
          });

          user.emit("success", {
            myai: chatCompletion.choices[0].message.content,
          });
        } catch (error) {
          console.error(error);

          user.emit("errorinai", { message: error.message });
        }
      });
    });
  } catch (error) {
    console.error(error);
  }
}

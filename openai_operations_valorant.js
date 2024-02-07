import OpenAI from "openai";

let messages = [];

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

async function make_openai_call(file_context, text, model_name) {
    try {
        messages = [{role: "system", content: file_context}, {role: "user", content: text}];

        const response = await openai.chat.completions.create({
            model: model_name,
            messages: messages,
            temperature: 1,
            max_tokens: 256,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0,
        });
        
        if (response.choices) {
            let agent_response = response.choices[0].message.content;
            console.log(`Agent Response: ${agent_response}`);
            messages.push({role: "assistant", content: agent_response});
            return agent_response;
        } else {
            // Handle the case when no choices are returned
            throw new Error("No choices returned from openai");
        }
    } catch (error) {
        // Handle any errors that may occur
        console.error(error);
        return "Sorry, Bakaq ran out of money bakabo3Sad";
    }
}

export { make_openai_call };

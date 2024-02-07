import express from 'express';
import fs from 'fs';
import ws from 'ws';
import expressWs from 'express-ws';

import {job} from './keep_alive.js';

import {OpenAIOperations} from './openai_operations.js';
import {TwitchBot} from './twitch_bot.js';

// start keep alive cron job
job.start();
console.log(process.env)

// setup express app
const app = express();
const expressWsInstance = expressWs(app);

// set the view engine to ejs
app.set('view engine', 'ejs');

// load env variables
let GPT_MODE = process.env.GPT_MODE // CHAT or PROMPT
let HISTORY_LENGTH = process.env.HISTORY_LENGTH // number of messages to keep in history
let OPENAI_API_KEY = process.env.OPENAI_API_KEY // openai api key
let MODEL_NAME = process.env.MODEL_NAME // openai model name (e.g. gpt-3, gpt-3.5-turbo, gpt-4)
let TWITCH_USER = process.env.TWITCH_USER // twitch bot username
let TWITCH_AUTH =  process.env.TWITCH_AUTH // tmi auth token
let COMMAND_NAME = process.env.COMMAND_NAME // comma separated list of commands to trigger bot (e.g. !gpt, !chat)
let CHANNELS = process.env.CHANNELS // comma separated list of channels to join
let SEND_USERNAME = process.env.SEND_USERNAME // send username in message to openai
let ENABLE_TTS = process.env.ENABLE_TTS // enable text to speech
let ENABLE_CHANNEL_POINTS = process.env.ENABLE_CHANNEL_POINTS; // enable channel points

if (!GPT_MODE) {
    GPT_MODE = "CHAT"
}
if (!HISTORY_LENGTH) {
    HISTORY_LENGTH = 5
}
if (!OPENAI_API_KEY) {
    console.log("No OPENAI_API_KEY found. Please set it as environment variable.")
}
if (!MODEL_NAME) {
    MODEL_NAME = "gpt-3.5-turbo"
}
if (!TWITCH_USER) {
    TWITCH_USER = "oSetinhasBot"
    console.log("No TWITCH_USER found. Using oSetinhasBot as default.")
}
if (!TWITCH_AUTH) {
    // https://dev.twitch.tv/console
    // https://twitchapps.com/tmi/
    TWITCH_AUTH = "oauth:vgvx55j6qzz1lkt3cwggxki1lv53c2"
    console.log("No TWITCH_AUTH found. Using oSetinhasBot auth as default.")
}
if (!COMMAND_NAME) {
    COMMAND_NAME = ["!gpt"]
} else {
    // split commands by comma into array
    COMMAND_NAME = COMMAND_NAME.split(",")
}
COMMAND_NAME = COMMAND_NAME.map(function(x){ return x.toLowerCase() })
if (!CHANNELS) {
    CHANNELS = ["oSetinhas", "jones88"]
} else {
    // split channels by comma into array
    CHANNELS = CHANNELS.split(",")
}
if (!SEND_USERNAME) {
    SEND_USERNAME = "true"
}
if (!ENABLE_TTS) {
    ENABLE_TTS = "false"
}
if (!ENABLE_CHANNEL_POINTS) {
    ENABLE_CHANNEL_POINTS = "false";
}

// init global variables
const MAX_LENGTH = 399
let file_context = "You are a helpful Twitch Chatbot."
let file_context_valorant = "You are a helpful Twitch Chatbot."
let last_user_message = ""

// setup twitch bot
const channels = CHANNELS;
const channel = channels[0];
console.log("Channels: " + channels)

const bot = new TwitchBot(TWITCH_USER, TWITCH_AUTH, channels, OPENAI_API_KEY, ENABLE_TTS);

// setup openai operations
file_context = fs.readFileSync("./file_context.txt", 'utf8');
file_context_valorant = fs.readFileSync("./file_context_valorant.txt", 'utf8');
const openai_ops = new OpenAIOperations(file_context, OPENAI_API_KEY, MODEL_NAME, HISTORY_LENGTH);
const openai_ops_valorant = new OpenAIOperations(file_context_valorant, OPENAI_API_KEY, MODEL_NAME, 0);

// setup twitch bot callbacks
bot.onConnected((addr, port) => {
    console.log(`* Connected to ${addr}:${port}`);

    // join channels
    channels.forEach(channel => {
        console.log(`* Joining ${channel}`);
        console.log(`* Saying hello in ${channel}`)
    });
});

bot.onDisconnected((reason) => {
    console.log(`Disconnected: ${reason}`);
});

// connect bot
bot.connect(
    () => {
        console.log("Bot connected!");
    },
    (error) => {
        console.log("Bot couldn't connect!");
        console.log(error);
    }
);

bot.onMessage(async (channel, user, message, self) => {
    if (self) return;
    if (ENABLE_CHANNEL_POINTS==="true") {
        console.log(`The message id is ${user["msg-id"]}`);
        if (user["msg-id"] === "highlighted-message") {
            console.log(`The message is ${message}`);
            const response = await openai_ops.make_openai_call(message);
            bot.say(channel, response);
        }
    }
    // check if message is a command started with !COMMAND_NAME (e.g. !gpt) in lower-cased
    if (message.toLowerCase().startsWith(COMMAND_NAME)) {
        let regex = new RegExp(`^${COMMAND_NAME}\\s*`, 'i');    
        let text = message.replace(regex, '');       
        if (!text) {
            // If there's no text after the command, don't proceed with the OpenAI call or response.
            console.log("Command received without any message. No action taken.");
           
            return;
        }
        if (SEND_USERNAME) {
            text = "Message from user " + user.username + ": " + text
        }
        // make openai call
        const response = await openai_ops.make_openai_call(text);
        // split response if it exceeds twitch chat message length limit
        // send multiples messages with a delay in between
        if (response.length > MAX_LENGTH) {
            const messages = response.match(new RegExp(`.{1,${MAX_LENGTH}}`, "g"));
            messages.forEach((message, index) => {
                setTimeout(() => {
                    bot.say(channel, message);
                }, 1000 * index);
            });
        } else {
            bot.say(channel, response);
        }
        if (ENABLE_TTS === "true") {
            try {
                console.log(user.username + ' - ' + user.userstate);
                const ttsAudioUrl = await bot.sayTTS(channel, response, user.userstate);
                // Notify clients about the file change
                notifyFileChange(ttsAudioUrl);
            } catch (error) {
                console.error(error);
            }
        }
    }
 let lastVsummaryCommandTime = 0; // Initialize the last command time

if (message.trim().toLowerCase().startsWith('!vsummary')) {
    const currentTime = Date.now();
    const cooldownDuration = 30000; // 30 seconds in milliseconds

    if (currentTime - lastVsummaryCommandTime >= cooldownDuration) {
        // Command is not on cooldown, execute it
        handleVsummaryCommand(channel, user);
        
        // Update the last command time
        lastVsummaryCommandTime = currentTime;
    } else {
        return;
    }
}
});

async function handleVsummaryCommand(channel, user) {
    try {
        // Fetch Valorant summary data
        const summary = await fetchData();

        let text;
        if (SEND_USERNAME) {
            text = "this is the summary of the last 10 games of bakabot:" + summary
        }
        console.log(text);
        const response = await openai_ops_valorant.make_openai_call(text);

        // Split response if it exceeds twitch chat message length limit
        // Send multiples messages with a delay in between
        if (response.length > MAX_LENGTH) {
            const messages = response.match(new RegExp(`.{1,${MAX_LENGTH}}`, "g"));
            messages.forEach((message, index) => {
                setTimeout(() => {
                    bot.say(channel, message);
                }, 1000 * index);
            });
        } else {
            bot.say(channel, response);
        }
    } catch (error) {
        console.error('Error handling !vsummary command:', error);
        // Handle error
    }
}
app.ws('/check-for-updates', (ws, req) => {
    ws.on('message', (message) => {
        // Handle WebSocket messages (if needed)
    });
});

// setup bot
const messages = [
    {role: "system", content: "You are a helpful Twitch Chatbot."}
];

console.log("GPT_MODE is " + GPT_MODE)
console.log("History length is " + HISTORY_LENGTH)
console.log("OpenAI API Key:" + OPENAI_API_KEY)
console.log("Model Name:" + MODEL_NAME)

app.use(express.json({extended: true, limit: '1mb'}))
app.use('/public', express.static('public'))

app.all('/', (req, res) => {
    console.log("Just got a request!")
    res.render('pages/index');
    //res.sendFile(process.env.RENDER_SRC_ROOT + '/index.ejs')
    //res.send('Yo!')
})

if (process.env.GPT_MODE === "CHAT"){
    fs.readFile("./file_context.txt", 'utf8', function(err, data) {
        if (err) throw err;
        console.log("Reading context file and adding it as system level message for the agent.")
        messages[0].content = data;
    });
} else {
    fs.readFile("./file_context.txt", 'utf8', function(err, data) {
        if (err) throw err;
        console.log("Reading context file and adding it in front of user prompts:")
        file_context = data;
        console.log(file_context);
    });
}

app.get('/gpt/:text', async (req, res) => {

    //The agent should receive Username:Message in the text to identify conversations with different users in his history.
    const text = req.params.text

    // define function to check history length and perform bot response
    const answer_question = async (answer) => {
        if (answer.length > MAX_LENGTH) {
            const messages = answer.match(new RegExp(`.{1,${MAX_LENGTH}}`, "g"));
            messages.forEach((message, index) => {
                setTimeout(() => {
                    bot.say(channel, message);
                }, 1000 * index);
            });
        } else {
            bot.say(channel, answer);
        }
    }

    let answer = ""
    if (GPT_MODE === "CHAT") {
        //CHAT MODE EXECUTION
        answer = await openai_ops.make_openai_call(text);
    } else if(GPT_MODE === "PROMPT") {
        //PROMPT MODE EXECUTION

        // create prompt based on file_context and the user prompt
        let prompt = file_context;
        prompt += "\n\nUser: " + text + "\nAgent:"
        answer = await openai_ops.make_openai_call_completion(prompt);
    } else {
        //ERROR MODE EXECUTION
        console.log("ERROR: GPT_MODE is not set to CHAT or PROMPT. Please set it as environment variable.")
    }

    // send response
    await answer_question(answer)

    res.send(answer)
})

// make app always listening to twitch chat and get new messages starting with !gpt on port 3000
const server = app.listen(3000, () => {
    console.log('Server running on port 3000');
});

const wss = expressWsInstance.getWss();
// const wss = appWithWebSocket.ws

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        // Handle client messages (if needed)
    });
});

// Notify clients when the file changes
function notifyFileChange() {
    wss.clients.forEach((client) => {
        if (client.readyState === ws.OPEN) {
            client.send(JSON.stringify({ updated: true }));
        }
    });
}


// Function to calculate headshot rate
// Function to calculate headshot rate
function calculateHeadshotRate(shots) {
  const totalShots = shots.head + shots.body + shots.leg;
  const headshotRate = (shots.head / totalShots) * 100;
  return headshotRate.toFixed(2);
}

// Make a GET request to the API
async function fetchData() {
  try {
    const response = await fetch('https://api.henrikdev.xyz/valorant/v1/by-puuid/lifetime/matches/ap/1c663650-bf7e-562a-bf99-b486461227b7?mode=competitive&page=1&size=10');
    const data = await response.json();

    const response2 = await fetch('https://api.kyroskoh.xyz/valorant/v1/mmr/ap/bakabot/7117?show=combo&display=0');
    const data2 = await response2.text(); // Assuming the response is already in string format

    const playerName = `${data.name}`;
    const matches = data.data.map(match => {
      const headshotRate = calculateHeadshotRate(match.stats.shots);
      const won = (match.stats.team === 'Blue' && match.teams.blue > match.teams.red) ||
                  (match.stats.team === 'Red' && match.teams.red > match.teams.blue);
      const totalScore = match.stats.score;
      const totalRoundsPlayed = match.teams.red + match.teams.blue;
      const avgScorePerRound = totalScore / totalRoundsPlayed;
      
      // Calculate K/D/A ratio
      const kills = match.stats.kills;
      const deaths = match.stats.deaths;
      const assists = match.stats.assists;
      const kdaRatio = `${kills}/${deaths}/${assists}`; // Format as K/D/A

      return [
        match.meta.map.name,
        avgScorePerRound.toFixed(2), // Round to 2 decimal places
        kdaRatio, // Replace individual K/D/A with combined K/D/A ratio
        headshotRate + '%',
        match.stats.damage.made,
        match.stats.damage.received,
        won ? 'Yes' : 'No'
      ].join(',');
    });

    const resultString = `Player: ${playerName}-Rank: ${data2}\nmap,AverageScorePerRound,K/D/A,headshotRate,damageMade,damageReceived,won\n${matches.join('\n')}`;
    
    return resultString;
  } catch (error) {
    console.error('Error fetching data:', error);
    return 'Error fetching data';
  }
}







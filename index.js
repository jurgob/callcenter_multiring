/**
nexmo context: 
you can find this as the second parameter of rtcEvent funciton or as part or the request in req.nexmo in every request received by the handler 
you specify in the route function.

it contains the following: 
const {
        generateBEToken,
        generateUserToken,
        logger,
        csClient,
        storageClient
} = nexmo;

- generateBEToken, generateUserToken,// those methods can generate a valid token for application
- csClient: this is just a wrapper on https://github.com/axios/axios who is already authenticated as a nexmo application and 
    is gonna already log any request/response you do on conversation api. 
    Here is the api spec: https://jurgob.github.io/conversation-service-docs/#/openapiuiv3
- logger: this is an integrated logger, basically a bunyan instance
- storageClient: this is a simple key/value inmemory-storage client based on redis

*/

/**
 *
 * This function is meant to handle all the asyncronus event you are gonna receive from conversation api
 *
 * it has 2 parameters, event and nexmo context
 * @param {object} event - this is a conversation api event. Find the list of the event here: https://jurgob.github.io/conversation-service-docs/#/customv3
 * @param {object} nexmo - see the context section above
 * */


const DATACENTER = `https://api.nexmo.com`
const CONNECTED_USERS='boemo'
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
const Logger = require("bunyan");
const path = require("path");

const CS_URL = `https://api.nexmo.com`;
const WS_URL = `https://ws.nexmo.com`;

function CallStatus(props){
  const {conv_id, ringed_agents_memb_ids, assigned_agent_memb_id}= props;
  return {
    ...props
  }
}

const receivePhoneCall = async (event, { logger, csClient,storageClient } ) => {
  const connected_agents = await storageClient.get('connected_users') || ""
  // const connected_agents = CONNECTED_USERS
  const knocking_id = event.from
  logger.info('Step 1, CREATE CONVERSATION/CALL')
  const channel = event.body.channel
  const convRes = await csClient({
      url: `${DATACENTER}/v0.3/conversations`,
      method: "post",
      data: {
        "properties": {
          "ttl": 172800,
          custom_data: {
            ringed_agents: connected_agents
          }
        },
        
      },
  })

  const conversation_id = convRes.data.id
  const user_id = event.body.user.id
  const customer_phone_number = event.body.channel.from.number
  // await sleep(1000)
  logger.info(`Step 2, ADD THE CUSTOMER LEG INTO THE CONVERSATION ${conversation_id}`)
  const memberRes = await csClient({
      url: `${DATACENTER}/v0.3/conversations/${conversation_id}/members`,
      method: "post",
      data: {
          user: {
              id: user_id
          },
          knocking_id: knocking_id,
          state: "joined",
          channel: {
              type: channel.type,
              id: channel.id,
              to: channel.to,
              from: channel.from,
              "preanswer": false
          },
          "media": {
              "audio": true
          }
      }
  })
  
  logger.info(`Step 3, INVITE ALL THE AGENT'S SDKS ${connected_agents}`)
  const inviteAgents = connected_agents.split(',').map(async agent_name => {
    const agentMemberRes = await csClient({
      url: `${DATACENTER}/v0.3/conversations/${conversation_id}/members`,
      method: "post",
      data: {
          state: "invited",
          user: {
            name: agent_name
          },
          channel: {
            type: "app",
            to: {
              type: "app",
              user: agent_name
            },
            from: {
              type: "phone",
              number:customer_phone_number
            }
          },
          "media": {
            "audio_settings": {
              "enabled": true,
              "earmuffed": true,
              "muted": true
            },
            "audio": true
          }
      }
    })

    return {
      name: agent_name,
      member_id: agentMemberRes.data.id
    }
  })

  const membersIds = await Promise.all(inviteAgents)
  logger.info(`ALL THE AGENTS FOLLOWING ARE RINGING`, connected_agents)
  const agentsMembersIds = membersIds.reduce((acc,cur) => {
    acc[cur.name] =cur.member_id 
    return acc
  }, {})

  const callStatus = CallStatus({
    conv_id: conversation_id, 
    ringed_agents_memb_ids: Object.values(agentsMembersIds), 
    assigned_agents_memb_id: null
  })
  logger.info(`agentsMembersId`, agentsMembersIds)
  storageClient.set(`call:${conversation_id}`, JSON.stringify(callStatus))
  
} 


const firstSdkPickUpTheCall = async (event, { logger, csClient,storageClient } ) => {
  const conversation_id = event.conversation_id
  //const agentsMembersIdsString = await storageClient.get(`${conversation_id}_agents_memberids`)
  // const agentsMembersIds = JSON.parse(agentsMembersIdsString)
  const callStatusString = await storageClient.get(`call:${conversation_id}`)
  const callStatus = JSON.parse(callStatusString)
  callStatus.assigned_agent_memb_id = event.body.member_id

  //write it asyncronusly
  storageClient.set(`call:${conversation_id}`, JSON.stringify(callStatus))

  logger.info({
    conversation_id,
    callStatus
  }, `agentsMembersIds to hangup`)


  const joinedAgentName = event.body.user.name
  // Object.keys(callStatus.ringed_agents_memb_ids).filter(agentName => agentName !== joinedAgentName).forEach(agentName => {
    callStatus.ringed_agents_memb_ids.filter(mem_id => mem_id !== callStatus.assigned_agent_memb_id).forEach(member_id => {
    // const member_id = agentsMembersIds[agentName]
    csClient({
      url: `${DATACENTER}/v0.3/conversations/${conversation_id}/members/${member_id}`,
      method: "patch",
      data: {
        state: "left",
        reason: {
          code: "111",
          text: "another operator answered the call"
        }
      }
    }).catch(err => logger.info(err))  
  })
}

const cleanTheCallOnFirstLeave = async (event ,{ logger, csClient,storageClient } ) => {

}


const rtcEvent = async (event, vonage_context) => {
  const {type, body} = event
  try {
    if (type === 'app:knocking'  && body.channel.type == "phone" ) {
      receivePhoneCall(event, vonage_context)  
    }else if(type === 'member:joined' && body.channel.type == "app" ) {
      firstSdkPickUpTheCall(event, vonage_context)
    }

  } catch (err) {
    logger.error({ err }, "Error on rtcEvent function");
  }
};


/**
 *
 * @param {object} app - this is an express app
 * you can register and handler same way you would do in express.
 * the only difference is that in every req, you will have a req.nexmo variable containning a nexmo context
 *
 */
const route = (app, express) => {
  app.use('/static', express.static(path.join(__dirname, "build")));



  app.get("/", function (req, res) {
    res.sendFile(path.join(__dirname, "build", "index.html"));
  });

  app.get("/api/connected", async (req, res) => {
    const {
      generateBEToken,
      generateUserToken,
      logger,
      csClient,
      storageClient,
    } = req.nexmo;

    const username = await storageClient.get('connected_users')
    res.json({
      username,
    });
  });

  app.post("/api/login", async (req, res) => {
    const {
      generateBEToken,
      generateUserToken,
      logger,
      csClient,
      storageClient,
    } = req.nexmo;

    const { username } = req.body;
    
    const connected_users_string = await storageClient.get('connected_users') || ""

    const connected_users = !connected_users_string ? [] : connected_users_string.split(',')

    await storageClient.set('connected_users', connected_users.concat(username).join(','))
    res.json({
      user: username,
      token: generateUserToken(username),
      ws_url: WS_URL,
      cs_url: CS_URL,
    });
  });

  app.post("/api/subscribe", async (req, res) => {
    const {
      generateBEToken,
      generateUserToken,
      logger,
      csClient,
      storageClient,
    } = req.nexmo;

    try {
      const { username } = req.body;
      const resNewUser = await csClient({
        url: `${CS_URL}/beta/users`,
        method: "post",
        data: {
          name: username,
        },
      });

      await storageClient.set(`user:${username}`, resNewUser.data.id);
      const storageUser = await storageClient.get(`user:${username}`);

      return res.json({ username, resNewUser: resNewUser.data, storageUser });
    } catch (err) {
      console.log("error", err);
      logger.error({ err }, "ERROR");
      throw err;
    }
  });

  app.get("/api/users/:username", async (req, res) => {
    const { logger, csClient, storageClient } = req.nexmo;

    const { username } = req.params;
    let user;
    user = await storageClient.get(`user:${username}`);
    if(user){
      console.log(`user `, user)
      user = JSON.parse(user)
    }
    if (!user) {
      const userResponse = await csClient({
        url: `${CS_URL}/v0.3/users?name=${username}`,
        method: "get",
      });
      user = userResponse.data._embedded.users[0];
      await storageClient.set(`user:${username}`, JSON.stringify(user));
    }
    res.json({ user });
  });

  app.post("/api/invite/:conversation_name/:username", async (req, res) => {
    const { logger, csClient, storageClient } = req.nexmo;

    const { username ,conversation_name} = req.params;

    try{
      let user;
      user = await storageClient.get(`user:${username}`);
      if(user){
        console.log(`user `, user)
        user = JSON.parse(user)
      }
      if (!user) {
        const userResponse = await csClient({
          url: `${CS_URL}/v0.3/users?name=${username}`,
          method: "get",
        });
        user = userResponse.data._embedded.users[0];
        await storageClient.set(`user:${username}`, JSON.stringify(user));
      }

      let conversation;
      const conversationResponse = await csClient({
        url: `${CS_URL}/v0.3/conversations`,
        method: "post",
        data:{
          name: conversation_name
        }
      });
      conversation = conversationResponse.data;

      let member;
      const memberResponse = await csClient({
        url: `${CS_URL}/v0.3/conversations/${conversation.id}/members`,
        method: "post",
        data:{
          "state": "invited",
          "user": {
            "name": username
          },
          "channel": {
            "type": "app"
          }
        }
      });
      conversation = conversationResponse.data;


      res.json({ user, conversation,member });
    }catch(e){
      res.status(500).json({ error: e });
    }
  });

};

module.exports = {
  rtcEvent,
  route,
};

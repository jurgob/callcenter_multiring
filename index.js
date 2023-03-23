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
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
const Logger = require("bunyan");
const path = require("path");

const CS_URL = `https://api.nexmo.com`;
const WS_URL = `https://ws.nexmo.com`;

function CallStatus(props){
  
  let {conv_id, ringed_agents_memb_ids, assigned_agent_memb_id, customer_phone_memb_id, status}= props;
  if(!status)
    status = 'created'
  //status: created | ringing | answered | completed | transfered
 
  return {
    ...props
  }
}

async function  saveCall(storageClient, callStatus){
  return await storageClient.set(`call:${callStatus.conv_id}`, JSON.stringify(callStatus))

}

async function loadCall(storageClient,conversation_id){
  const callStatusString = await storageClient.get(`call:${conversation_id}`)
  if(!callStatusString)
    return undefined
  
    const callStatus = JSON.parse(callStatusString)
  return CallStatus(callStatus)

}

const receivePhoneCall = async (event, { logger, csClient,storageClient } ) => {
  const connected_agents = await storageClient.get('connected_users') || ""
  const knocking_id = event.from
  const channel = event.body.channel
  const customer_leg_id = channel.id
  const customer_phone_number = channel.from.number
  const user_id = event.body.user.id

  logger.info('Step 1, CREATE CONVERSATION/CALL')
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
  const customer_phone_memb_id = memberRes.data.id  
  const connectedAgents = connected_agents.split(',')
  await inviteAgents(connectedAgents, csClient, customer_leg_id, customer_phone_number, conversation_id, logger, customer_phone_memb_id, storageClient)
} 
//pass the umber from the client if has customer_phone_number, storageClient, 
const inviteAgents = async (connected_agents, csClient, customer_leg_id, customer_phone_number, conversation_id, logger, customer_phone_memb_id, storageClient ) =>{
  logger.info(`Step 3, INVITE ALL THE AGENT'S SDKS ${connected_agents}`)
  const agents = await connected_agents.map(async agent_name => {
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
              number: customer_phone_number
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

  const membersIds = await Promise.all(agents)

  logger.info(`ALL THE AGENTS FOLLOWING ARE RINGING`, connected_agents)

  // add mp3 to the customer leg

  const mp3add = await csClient({
    url: `${DATACENTER}/v0.3/legs/${customer_leg_id}/stream`,
    method: "post",
    data: {
      "stream_url":["https://file-examples.com/storage/fef1706276640fa2f99a5a4/2017/11/file_example_MP3_700KB.mp3"],
      "level":0,
      "loop":0
    },
  })
  logger.info(`ADD MP3 AS RINGING TONE ${mp3add.status}`)

  const callStatus = CallStatus({
    status: "ringing",
    conv_id: conversation_id, 
    members: membersIds,
    assigned_agent_memb_id: null,
    customer_phone_memb_id,
    customer_phone_number,
    customer_leg_id
  })
  storageClient.set(`call:${conversation_id}`, JSON.stringify(callStatus))
}


const firstSdkPickUpTheCall = async (event, { logger, csClient },callStatus ) => {
  const conversation_id = event.conversation_id
  const memberIdsToHangup = callStatus.members.filter(member => member.member_id !== callStatus.assigned_agent_memb_id).map(member=>member.member_id)
  
  logger.info(memberIdsToHangup, `agentsMembersIds to hangup`)
  
  memberIdsToHangup.forEach(member_id => {
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

  // Stop mp3 on the customer leg
  const mp3Stop = await csClient({
      url: `${DATACENTER}/v0.3/legs/${callStatus.customer_leg_id}/stream`,
      method: "delete",
      data: {},
    })
    logger.info(`STOP MP3 AS RINGING TONE ${mp3Stop.data}`)
}

const cleanTheCallOnFirstLeave = async (event ,{ logger, csClient },callStatus ) => {
  const conversation_id = callStatus.conv_id
  const from = event.from
  logger.info({conversation_id, from}, 'cleanTheCallOnFirstLeave')
  
  if(from === callStatus.customer_phone_memb_id)
    await csClient({
      url: `${DATACENTER}/v0.3/conversations/${conversation_id}/members/${callStatus.assigned_agent_memb_id}`,
      method: "patch",
      data: {
        state: "left",
        reason: {
          code: "111",
          text: "call terminated by the other end"
        }
      }
    })

  if(from === callStatus.assigned_agent_memb_id)
    await csClient({
      url: `${DATACENTER}/v0.3/conversations/${conversation_id}/members/${callStatus.customer_phone_memb_id}`,
      method: "patch",
      data: {
        state: "left",
        reason: {
          code: "111",
          text: "call terminated by the other end"
        }
      }
    })

  await csClient({
    url: `${DATACENTER}/v0.3/conversations/${conversation_id}`,
    method: "delete",
  })
    
}
//This function is called every time you get a conversation APi event. here is the list of the events you can get: https://jurgob.github.io/conversation-service-docs/#/openapiui  .Without this tool, to receive those event you should set the rtc->webhook->rtc_event capability in your vonage application (https://developer.nexmo.com/api/application.v2)
const rtcEvent = async (event, vonage_context) => {
  const {type, body} = event
  try {
    const {storageClient, logger} = vonage_context

    if (type === 'app:knocking'  && body.channel.type == "phone" ) {
      logger.info('CALL-STEP 1 create the call, ring agents')
      receivePhoneCall(event, vonage_context)  
    }else if(['member:joined','rtc:hangup', 'sip:hangup'].includes(type) ){ 
      const conversation_id = event.conversation_id
      const from = event.from

      const callStatus = await loadCall(storageClient, conversation_id)

      if(type === 'member:joined' && body.channel.type == "app" ) {
        logger.info({event, callStatus}, 'CALL-STEP 2 join first agent picking up the call, hang up others')
      
        callStatus.assigned_agent_memb_id = body.member_id
        callStatus.status = 'answered'
        //write it asyncronusly as we are not using await
        saveCall(storageClient,callStatus)
        
        firstSdkPickUpTheCall(event, vonage_context,callStatus)

      }else if(type.includes(':hangup') && (from === callStatus.assigned_agent_memb_id || from === callStatus.customer_phone_memb_id)  ){
        
        if(callStatus.status == 'answered'){
          logger.info({event, callStatus},'CALL-STEP 3 cancel the call once the agent or the customer hang up')

          callStatus.status = 'completed'
          //write it asyncronusly as we are not using await
          await saveCall(storageClient,callStatus)
          cleanTheCallOnFirstLeave(event, vonage_context,callStatus)  
        }else if( callStatus.status == 'transfered'){
          logger.info({event, callStatus},'CALL IS BEING TRANSFERED')
        }

        // cleanTheCallOnFirstLeave(event, vonage_context,callStatus)

      }

    }

  } catch (err) {
    console.log(err)
    vonage_context.logger.error({type,  err }, "Error on rtcEvent function");
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

  app.get('/api/transfer/:conversationId',async (req, res)=>{
    const {storageClient, csClient, logger} = req.nexmo
    const conversationId = req.params.conversationId
    const callStatus = await loadCall(storageClient, conversationId)
    callStatus.status = 'transfered'
    await saveCall(storageClient, callStatus)

    //hangingup the current agent
    await csClient({
      url: `${DATACENTER}/v0.3/conversations/${conversationId}/members/${callStatus.assigned_agent_memb_id}`,
      method: "patch",
      data: {
        state: "left",
        reason: {
          code: "111",
          text: "call_transferred"
        }
      }
    })

    const connectedAgents = callStatus.members.filter( member => member.member_id !=callStatus.assigned_agent_memb_id).map(member => member.name)
    await inviteAgents(connectedAgents, csClient, callStatus.customer_leg_id, callStatus.customer_phone_number, conversationId, logger, callStatus.customer_phone_memb_id, storageClient)
    const newCallStatus = await loadCall(storageClient, conversationId)
    res.json({
      newCallStatus
    });
  })

};

module.exports = {
  rtcEvent,
  route,
};

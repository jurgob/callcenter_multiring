import React, { useState, useEffect } from 'react';

import CSClient from '../utils/csClient'
import FormCreateConversation from '../components/FormCreateConversation'
import FormJoinConversation from '../components/FormJoinConversation'
import FormEnableAudioInConversations from '../components/FormEnableAudioInConversations'
import Audio from '../components/Audio'
import createRtcAudioConnection from '../utils/createRtcAudioConnection'
import EventsHistory from '../components/EventsHistory'

import NexmoClient from "nexmo-client";

const nexmoClient = new NexmoClient({ debug: false });

function CurrentCall({status, direction,onReject}){
    return <div>
        <div>status: {status}</div>
        <div>direction: {direction}</div>
        <div>
            <button onClick={onReject} >Reject</button>
        </div>
    </div>
}


// const csClient = CSClient()


function LoggedPage(props) {

    const [curCall, setCurCall]= useState(null)
    const [token, setToken]= useState("")
    const [eventsHistory, setEvents] = useState([])
    const [myConversationsState, setMyConversationsState] = useState([])
    const [conversationsEvents, setConversationsEvents] = useState({})

    // useCSClientEvents
    const [audioState, setAudioState] = useState({
        audioSrcObject: null,
        peerConnection: null
    })


    //init cs client, called on login success
    useEffect(() => {


        if(token && token === props.loginData?.token){
            return;
        }else{
            setToken(props.loginData?.token)
        }

        console.log(` ->->->-> useEffect init csClient token: `, props.loginData?.token)


        const initCSClient = async () => {
            console.log(` ++++ initialize createCSClient`)
            const { token, cs_url, ws_url } = props.loginData
            const nexmoApp = await nexmoClient.login(token)
            window.nexmoClient = nexmoClient
            window.nexmoApp = nexmoApp

            nexmoApp.on('member:call', (member, call) => {
                window.call = call
                call.conversation.on("member:left", call.conversation.id, (from, event) => {
                    console.log(`conv ${call.conversation.id} event: `, from, event)
                })

                setCurCall(call)
            })

        }

        

        if (nexmoClient.connection.io) {
            nexmoClient.connection.io.on("packet", async (packet) => {
              if (packet.type !== 2) return;
              if (packet.data[0] === "echo") return;
              const clientEvent = {
                type: packet.data[0],
                ...packet.data[1]
              };
              console.log(`socket event`, clientEvent)
              setEvents(eventsHistory => [...eventsHistory, clientEvent])
            });
          }

        initCSClient()

    }, [props.loginData?.token])
    
    return (
        <div className="App">
            <h1>Conversations Client Playground</h1>
            <div>
                {curCall && <CurrentCall 
                    status={curCall.status} 
                    direction={curCall.direction} 
                    onReject={() => { curCall.reject()  }} 
                />}
               

                <EventsHistory
                    eventsHistory={eventsHistory}
                    onCleanHistoryClick={() => setEvents(() => [])}
                />
            </div>

        </div>
    );
}

export default LoggedPage
import React, { useState, useEffect,useRef } from 'react';

// import CSClient from '../utils/csClient'
// import FormCreateConversation from '../components/FormCreateConversation'
// import FormJoinConversation from '../components/FormJoinConversation'
// import FormEnableAudioInConversations from '../components/FormEnableAudioInConversations'
// import Audio from '../components/Audio'
// import createRtcAudioConnection from '../utils/createRtcAudioConnection'
import EventsHistory from '../components/EventsHistory'
import useLocalStorage from "use-local-storage";

import NexmoClient from "nexmo-client";


const nexmoClient = new NexmoClient({ debug: false });

function  CallsHistory({calls}){
    return (
        <div>
            {calls && calls.map(({status, direction,from}, idx) => (
                <div style={{display: "inline-block", padding: "5px", margin: "3px", border: "1px solid #999", backgroundColor: "#dfdfdf", borderRadius: "8px"  }}  key={idx} >
                    <div>status: {status}</div>
                    <div>direction: {direction}</div>
                    <div>from: {from}</div>
                </div>
            ))

            }
        </div>
    )
}

function CurrentCall({status, direction,from, onReject,onAnswer,onHangUp}){
    return <div>
        <div>status: {status}</div>
        <div>direction: {direction}</div>
        <div>from: {from}</div>
        <div>
            <button onClick={onReject} >Reject</button>
            <span> | </span>
            <button onClick={onAnswer} >Answer</button>
            <span> | </span>
            <button onClick={onHangUp} >Hang Up</button>
        </div>
    </div>
}


function Call(member, from){
    let statusCallbak = () => {}
    const call = {
        direction: "outbound",
        status: "created",
        from: from,
        hangUp: async () => {
            member.conversation.media.disable()
        },
        reject: async () => {
            member.conversation.leave({
                reason_code:"111",
                reason_text:"call refused"
            })
        },
        answer: async () => {
            await member.conversation.join()
            member.conversation.media.enable({
                autoPlayAudio: true
            })
        },
        onCallStatusChange: (statusCallbakFn) => { statusCallbak = statusCallbakFn }
    }
    function _setStatus(status){
        call.status = status
        statusCallbak(status)
    }

    member.conversation.on('leg:status:update', (memberEvent, event) => {     
        if( member.user.name === memberEvent.userName) {
            _setStatus(event.body.status)
        }
    })

    member.conversation.on('member:left', (memberEvent, event) => {
        if( member.user.name === memberEvent.userName) {
            statusCallbak('cancelled')
            setTimeout(()=> statusCallbak('completed'), 500)
            // completed
        }
    })

    return call
}

const defCallStatus = {
    status: "",
    from:"",
    direction:""
}

function LoggedPage(props) {
    const [callsHistory, setCallsHistory]= useLocalStorage("calls_history", [])
    const [curCall, setCurCall]= useState(defCallStatus)
    const curCallRef = useRef(null)

    const [token, setToken]= useState("")
    const [eventsHistory, setEvents] = useState([])

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

            nexmoApp.on('member:invited', (member, event) => {
                console.log(`!!!!!! member:invited !!!!!`)
                console.log(`member`, member, `event`, event)
                console.log(`nexmoApp.me.name`, nexmoApp.me.name)
                console.log(`event.body.user.name`, event.body.user.name)
                console.log(`event.body.media.audio`, event.body?.media?.audio)
                console.log(`event.body?.channel?.from?.number`, event.body?.channel?.from?.number)
                
                if(nexmoApp.me.name === event.body.user.name && event.body?.media?.audio == true){
                    window.conversation = member.conversation                   
                    window.member = member

                    const call = Call(member, event.body?.channel?.from?.number)
                    call.onCallStatusChange(status => {
                        console.log(`call.onCallStatusChange`, status)
                        
                        if(status !== `completed`) {
                            setCurCall(callInfo => ({
                                ...callInfo,
                                status
                            }))
                        }else {
                            
                            setCallsHistory( callsHistory => [
                                ...callsHistory, 
                                {   
                                    direction: call.direction,
                                    from: call.from,
                                    status, 
                                    terminated_at: Date.now()
                                }
                            ])
                            curCallRef.current = null
                            setCurCall(defCallStatus)
                        }

                        
                    })

                    curCallRef.current = call
                    setCurCall({
                        from: call.from,
                        status: call.status,
                        direction: call.direction,
                    })
                    


                }
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
              setEvents(eventsHistory => [...eventsHistory, clientEvent])
            });
          }

        initCSClient()

    }, [props.loginData?.token])

    return (
        <div className="App">
            <button onClick={() => {
                localStorage.clear()
                window.location.href = '/'
            }} >Logout</button>
            <h1>Conversations Client Playground</h1>
            <div>
                <div style={{verticalAlign: "top"}} >
                    <div style={{display: "inline-block", padding: "0px 5px ", marginRight: "15px", verticalAlign:"top"}}>
                    <h2>Current Call</h2>
                    {!curCallRef.current && <div>No active call</div>}
                    {curCallRef.current && <CurrentCall 
                        status={curCall.status} 
                        direction={curCall.direction} 
                        from={curCall.from}
                        onReject={() => { curCallRef.current.reject()  }} 
                        onAnswer={() => { curCallRef.current.answer()  }} 
                        onHangUp={() => { curCallRef.current.hangUp()  }} 
                    />}
                    </div>
                    <div style={{display: "inline-block",padding: "0px 5px 0px 15px", verticalAlign:"top", borderLeft: "1px solid #999"}} >
                    <h2>Calls History</h2>
                    {callsHistory.length > 0 && (
                        <div>
                           <CallsHistory calls={callsHistory} />
                        </div>
                    
                        )}
                </div>
                </div>

               {eventsHistory.length > 0 && (
                   <div>
                       <h2>Event History Debugger</h2>
                       <EventsHistory
                          eventsHistory={eventsHistory}
                            onCleanHistoryClick={() => setEvents(() => [])}
                        />
                   </div>
               )} 
                
                
            </div>

        </div>
    );
}

export default LoggedPage
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


const nexmoClient = new NexmoClient({ debug: true, enableInboundOffer:true });

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

function CurrentCall({status, direction,from, onReject,onAnswer,onHangUp, onTransfer}){
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
            <span> | </span>
            <button onClick={onTransfer} >transfer</button>
        </div>
    </div>
}


function Call(member, nxmCall){

    let statusCallbak = () => {}
    const call = {
        direction: "outbound",
        status: "created",
        from: nxmCall.from,
        conversation_id: nxmCall.conversation.id,
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
            console.log(`ANSER CALL`, Date.now())
            await nxmCall.answer()
            console.log(`CALL ESTABLISHED`, Date.now())
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
    direction:"",
    conversation_id:""
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
            const nexmoApp = await nexmoClient.createSession(token)
            window.nexmoClient = nexmoClient
            window.nexmoApp = nexmoApp

            nexmoApp.on("member:call", (member, nxmCall) => {
                console.log("member:call [member]", member)
                console.log("member:call [call]", nxmCall)
                const call = Call(member, nxmCall)
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
                                conversation_id: call.conversation_id,
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
                    conversation_id: call.conversation_id
                })        
            })
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
                        onHangUp={() => { 
                            curCallRef.current.hangUp()
                          }} 
                        onTransfer={()=>{props.onSubmitTransfer(curCallRef.current.conversation_id)}}
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
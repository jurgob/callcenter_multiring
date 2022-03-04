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



const csClient = CSClient()

function useCSClientEvents(csClient) {

    const [event, setEvent] = useState(null)

    const setLastEvent = (clientEvent) => {
        setEvent(clientEvent)
    }

    useEffect(() => {
        csClient.onEvent(setLastEvent)
        csClient.onRequestStart(setLastEvent)
        csClient.onRequestEnd(setLastEvent)
    }, [])

    return event
}

function LoggedPage(props) {

    // const [csClient, setCsClient] = useState(null)

    const lastCSClientEvent = useCSClientEvents(csClient)
    const [curCall, setCurCall]= useState(null)
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
        console.log(` ->->->-> useEffect init csClient`)

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



            csClient.connect({
                token, cs_url, ws_url
            });

        }

        initCSClient()


    }, [props.loginData])

    useEffect(() => {

        const appendHistory = (clientEvent) => {
            if (clientEvent)
                setEvents(eventsHistory => [...eventsHistory, clientEvent])
        }

        appendHistory(lastCSClientEvent)

    }, [lastCSClientEvent])


    useEffect(() => {
        console.log(` ->->->-> useEffect csClient Handler `, csClient);
        if (!csClient)
            return;

        const onTrack = (e) => {
            const _setAudioSrcObject = audioState.peerConnection.getRemoteStreams()[0]
            console.log(`_setAudioSrcObject `, _setAudioSrcObject)

            setAudioState(as => {
                console.log(`setAudioState onTrack`, {
                    ...as,
                    audioSrcObject: _setAudioSrcObject
                })
                return {
                    ...as,
                    audioSrcObject: _setAudioSrcObject
                }
            })
        }

        csClient.onEvent(async (evt) => {
            if (evt.type === 'rtc:answer') {
                const sdp = evt.body.answer
                const remoteDescription = new RTCSessionDescription({
                    type: 'answer',
                    sdp,
                })
                if (audioState.peerConnection) {
                    audioState.peerConnection.ontrack = onTrack
                    audioState.peerConnection.setRemoteDescription(remoteDescription)
                }
            }
        })

        csClient.onRequestEnd(async (event) => {
            const url = event.request.url
            if (url.includes("/users/") && url.includes("/conversations") ) {
                const conversations = event.response.data._embedded.conversations
                setMyConversationsState(conversations)
            }

            
        })

    }, [audioState])

    const onEnableAudioInConversationSubmit = async (data) => {
        // const { conversation_id } = data
        try {
            console.log(`--- onEnableAudioInConversationSubmit`, data)
            const { audio_conversation_id } = data
            const conversation_id = audio_conversation_id
            const pc = await createRtcAudioConnection()

            console.log(`setAudioState `, { ...audioState, peerConnection: pc })
            setAudioState({ ...audioState, peerConnection: pc })

            // peerConnection = pc
            const userConvRes = await csClient.request({
                url: `/v0.3/users/${csClient.getSessionData().user_id}/conversations`,
                method: "get"
            })

            const member_id = userConvRes.data._embedded.conversations.find(({ id }) => id === conversation_id)._embedded.member.id

            await csClient.request({
                url: `/v0.1/conversations/${conversation_id}/rtc`,
                method: "post",
                data: {
                    from: member_id,
                    body: {
                        offer: pc.localDescription,
                    }
                }
            })

        } catch (e) {
            console.log(`onEnableAudioInConversationSubmit error: `, e)
        }

    }

    const onCreateConversationSubmit = async (data) => {
        const { conversation_name, conversation_display_name } = data
        const convRes = await csClient.request({
            url: `/v0.3/conversations`,
            method: "post",
            data: {
                "name": conversation_name,
                "display_name": conversation_display_name
            }
        })

        await csClient.request({
            url: `/v0.3/conversations/${convRes.data.id}/members`,
            method: "post",
            data: {
                "state": "joined",
                "user": {
                    name: csClient.getSessionData().user_name,
                },
                "channel": {
                    "type": "app"
                }
            }
        })

    }

    const onJoinConversationSubmit = async (data) => {
        console.log('onJoinConversationSubmit ', data)
        const { conversation_join_id} = data
        await csClient.request({
            url: `/v0.3/conversations/${conversation_join_id}/members`,
            method: "post",
            data: {
                "state": "joined",
                "user": {
                    name: csClient.getSessionData().user_name,
                },
                "channel": {
                    "type": "app"
                }
            }
        })

    }

    const getMyConversations = async () => {
        await csClient.request({
            url: `/v0.3/users/${csClient.getSessionData().user_id}/conversations`,
            method: "get"
        })
    }

    
    return (
        <div className="App">
            <h1>Conversations Client Playground</h1>
            <div>
                {curCall && <CurrentCall 
                    status={curCall.status} 
                    direction={curCall.direction} 
                    onReject={() => { curCall.reject()  }} 
                />}
                <h2>Create Conversation and Join</h2>
                <FormCreateConversation onSubmit={onCreateConversationSubmit} />
                <h2>Join Conversation</h2>
                <FormJoinConversation onSubmit={onJoinConversationSubmit} />
                <h2>Get My Conversations</h2>
                <button onClick={getMyConversations} >Get My Conversations</button>
                <h2>Enable Audio In Conversations</h2>
                <FormEnableAudioInConversations onSubmit={onEnableAudioInConversationSubmit} />
                <Audio srcObject={audioState.audioSrcObject} />
                <div>
                    Conversations ({myConversationsState.length})
                    {myConversationsState.length && <div>
                        {myConversationsState.map(({ name, id, _embedded}) => {
                            const { member } = _embedded
                            return (<div key={id}>
                                <b>{name}: </b>{id} - {member.state} - {member.id}
                            </div>)
                        })}
                        

                    </div>

                    }
                </div>

                <EventsHistory
                    eventsHistory={eventsHistory}
                    onCleanHistoryClick={() => setEvents(() => [])}
                />
            </div>

        </div>
    );
}

export default LoggedPage
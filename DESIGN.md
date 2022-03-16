<h2>The scenario</h2>
On customer is calling and LVN, all the agents logged via browser receive the call, the first one to pick the call make everyone else to hangup. 

When the agent or the customer hangup, the entire call is hanged up. 


<h2>The "diagram"<h1>
<h3>WHEN the customer is calling</h3>
<pre>
PHONE -> call lvn                    -> LVN
CS -> knocking VOICE LEG             -> BE
CS <- create conversation            <- BE         
CS <- join voice leg                 <- BE                
CS <- invite agents (all agents)     <- BE
CS -> member:invited (all agents)    -> SDKs
</pre>

<h3>WHEN the first sdk is joining the call</h3>
<pre>
CS <- join the conversation <- SDK (agent1)
CS <- enable Audio          <- SDK (agent1)
CS -> hangup                -> SDK (all agents but agent1)                              
</pre>

<h3>WHEN the agent (OR a customer is leaving)</h3>
<pre>
CS <- hangup                <- SDK (agent 1)
CS -> hangup                -> BE
CS <- delete Conversation   -> BE
</pre>


<h2>Implementation Details</h2>
Here we are using directly the conversation api, togheter with an unofficial internall tool called `conversation-api-functions` to simplify development of vonage api prototypes. 







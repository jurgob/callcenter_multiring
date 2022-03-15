
# callcenter multiring

IN this example, we are implementing a contact center where a customer is calling your LVN, and a number of agent connected via browser are gonna receive the call. 
The first to repond is gonna pick the call, the other once are gonna be hanged up. 

look [the design](DESIGN.md) for a high level explaination. 



#install prerequisite
be sure you have node `v14.15.0` installed. 

if you have `brew` installed, just run ` brew install nvm` , if not follow this: https://github.com/nvm-sh/nvm

once you have nvm run
then `nvm install 14.15.0`. 


#install
clone this repo
`cd callcenter_multiring`

`npm install`

#run it:

the server: 
```
cd PRJ_DIR
npm start
```

the client: 
```
cd PRJ_DIR
cd client
npm start
```

more notes: 
more examples like this one: https://github.com/jurgob/conversation-api-function (examples section)
about this tool: https://casual-programming.com/an-easy-way-to-try-vonage-communication-api-locally/
internal cs docs: https://jurgob.github.io/conversation-service-docs/#/openapiuiv3






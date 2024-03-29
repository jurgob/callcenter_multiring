import React, { useState, useEffect } from "react";
import useLocalStorage from "use-local-storage";

import axios from "axios";

import FormLogin from "./components/FormLogin";

import LoggedPage from "./containers/LoggedPage.js";

import "./App.css";

const BACKEND_URL = `http://localhost:5001`;

function App() {
  const [loginData, setLoginData] = useLocalStorage("login_data",null);
  const [subscribeData, setsubscribeData] = useState(null);

  const onSubmitLogin = async ({ username }) => {
    const loginRes = await axios({
      url: `${BACKEND_URL}/api/login`,
      method: "post",
      data: {
        username: username,
      },
    });
    setLoginData(loginRes.data);
  };

  const onSubmitSubscribe = async ({ username }) => {
    const loginRes = await axios({
      url: `${BACKEND_URL}/api/subscribe`,
      method: "post",
      data: {
        username: username,
      },
    });
    setsubscribeData(loginRes.data);
  };

  const onSubmitTransfer = async (conversation_id) => {
    console.log("Called!!!")
    const transferRes = await axios({
      url: `${BACKEND_URL}/api/transfer/${conversation_id}`,
      method: "get",
    });
    setsubscribeData(transferRes.data);
  };

  useEffect(() => {
    document.title = "Conversation Service examples";
  }, []);

  return (
    <div>
      {!loginData && (
        <NotLoggedPage
          onSubmitLogin={onSubmitLogin}
          onSubmitSubscribe={onSubmitSubscribe}
        />
      )}
      {loginData && <LoggedPage loginData={loginData} onSubmitTransfer={onSubmitTransfer}/>}
    </div>
  );
}

const NotLoggedPage = ({ onSubmitLogin, onSubmitSubscribe }) => {
  return (
    <div>
      <h2>Login</h2>
      <FormLogin onSubmit={onSubmitLogin} />
      <h2>Subscribe</h2>
      <FormLogin onSubmit={onSubmitSubscribe} />
    </div>
  );
};

export default App;

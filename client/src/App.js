import React, { useState, useEffect } from "react";
import axios from "axios";

import FormLogin from "./components/FormLogin";

import LoggedPage from "./containers/LoggedPage.js";

import "./App.css";

const BACKEND_URL = `http://localhost:5001`;

function App() {
  const [loginData, setLoginData] = useState(null);
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
      {loginData && <LoggedPage loginData={loginData} />}
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

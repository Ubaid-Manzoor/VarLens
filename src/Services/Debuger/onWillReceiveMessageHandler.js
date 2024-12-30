const onWillReceiveMessageHandler = ({ message, currentScope, currentStackTrace, currentVariables }) => {
  if (message.type === "request") {
    if (message.command === "stackTrace") {
      currentStackTrace.push({ request: message });
    } else if (message.command === "scopes") {
      currentScope.push({ request: message });
    } else if (message.command === "variables") {
      currentVariables.push({ request: message });
    }
  }
};

module.exports = {
  onWillReceiveMessageHandler,
};

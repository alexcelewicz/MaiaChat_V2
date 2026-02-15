(function () {
    if (typeof window === "undefined") return;

    var config = window.maiaChat || {};
    if (!config.wsUrl || !config.channelId) return;

    var theme = config.theme || {};
    var bubbleUser = theme.bubbleUser || "#dbeafe";
    var bubbleBot = theme.bubbleBot || "#e2e8f0";
    var headerBg = theme.headerBg || "#0f172a";
    var headerText = theme.headerText || "#ffffff";
    var buttonBg = theme.buttonBg || "#2563eb";
    var buttonText = theme.buttonText || "#ffffff";
    var fontFamily = theme.fontFamily || "ui-sans-serif, system-ui";

    var containerId = config.containerId || "maiachat-webchat";
    var container = document.getElementById(containerId);

    if (!container) {
        container = document.createElement("div");
        container.id = containerId;
        document.body.appendChild(container);
    }

    container.innerHTML = "";
    container.style.cssText =
        "font-family: " +
        fontFamily +
        "; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 420px; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);";

    var header = document.createElement("div");
    header.textContent = config.title || "MaiaChat";
    header.style.cssText =
        "padding: 12px 16px; background: " +
        headerBg +
        "; color: " +
        headerText +
        "; font-weight: 600; border-radius: 12px 12px 0 0;";

    var messages = document.createElement("div");
    messages.style.cssText =
        "padding: 12px 16px; max-height: 320px; overflow-y: auto; background: #f8fafc;";

    var form = document.createElement("form");
    form.style.cssText =
        "display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid #e2e8f0;";

    var input = document.createElement("input");
    input.placeholder = "Type a message...";
    input.style.cssText =
        "flex: 1; border: 1px solid #cbd5f5; border-radius: 8px; padding: 8px 10px;";

    var button = document.createElement("button");
    button.type = "submit";
    button.textContent = "Send";
    button.style.cssText =
        "background: " +
        buttonBg +
        "; color: " +
        buttonText +
        "; border: none; border-radius: 8px; padding: 0 14px;";

    form.appendChild(input);
    form.appendChild(button);
    container.appendChild(header);
    container.appendChild(messages);
    container.appendChild(form);

    function appendMessage(content, isUser) {
        var bubble = document.createElement("div");
        bubble.textContent = content;
        bubble.style.cssText =
            "margin-bottom: 8px; padding: 8px 10px; border-radius: 10px; max-width: 80%; line-height: 1.4;";
        bubble.style.background = isUser ? bubbleUser : bubbleBot;
        bubble.style.marginLeft = isUser ? "auto" : "0";
        messages.appendChild(bubble);
        messages.scrollTop = messages.scrollHeight;
    }

    var ws = new WebSocket(
        config.wsUrl + "?channelId=" + encodeURIComponent(config.channelId)
    );

    ws.onmessage = function (event) {
        try {
            var payload = JSON.parse(event.data);
            if (payload.type === "message" && payload.content) {
                appendMessage(payload.content, false);
            }
        } catch (error) {
            console.warn("[MaiaChat] WebChat payload parse error", error);
        }
    };

    form.addEventListener("submit", function (event) {
        event.preventDefault();
        var text = input.value.trim();
        if (!text) return;
        appendMessage(text, true);
        ws.send(JSON.stringify({ type: "message", content: text }));
        input.value = "";
    });
})();

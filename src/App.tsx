import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import RecordingToolbar from "./components/recording/RecordingToolbar";
import EditorView from "./components/editor/EditorView";
import Teleprompter from "./components/teleprompter/Teleprompter";

type WindowType = "toolbar" | "editor" | "teleprompter" | "unknown";

function App() {
  const [windowType, setWindowType] = useState<WindowType>("unknown");

  useEffect(() => {
    const detectWindow = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const windowParam = urlParams.get("window");

        if (windowParam === "editor") {
          setWindowType("editor");
          document.body.classList.add("editor-window");
          return;
        }
        if (windowParam === "teleprompter") {
          setWindowType("teleprompter");
          document.body.classList.add("teleprompter-window");
          return;
        }

        const label = await invoke<string>("get_window_label");
        if (label === "toolbar") {
          setWindowType("toolbar");
          document.body.classList.add("toolbar-window");
        } else if (label === "editor") {
          setWindowType("editor");
          document.body.classList.add("editor-window");
        } else if (label === "teleprompter") {
          setWindowType("teleprompter");
          document.body.classList.add("teleprompter-window");
        } else {
          setWindowType("toolbar");
          document.body.classList.add("toolbar-window");
        }
      } catch (err) {
        console.error("Failed to detect window type:", err);
        setWindowType("toolbar");
        document.body.classList.add("toolbar-window");
      }
    };

    detectWindow();
  }, []);

  if (windowType === "unknown") {
    return null;
  }

  if (windowType === "toolbar") {
    return <RecordingToolbar />;
  }

  if (windowType === "teleprompter") {
    return <Teleprompter />;
  }

  return <EditorView />;
}

export default App;

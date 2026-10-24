import { ToastProvider } from "./hooks/useToast";
import MainScreen from "./screens/MainScreen";

export default function App() {
  return (
    <ToastProvider>
      <MainScreen />
    </ToastProvider>
  );
}

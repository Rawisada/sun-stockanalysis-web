import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/push";

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    void registerServiceWorker();
  }, []);

  return <Component {...pageProps} />;
}

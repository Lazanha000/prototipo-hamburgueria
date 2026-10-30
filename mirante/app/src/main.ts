import { mount } from "svelte";
import "@fontsource/literata/400.css";
import "@fontsource/literata/600.css";
import "@fontsource/literata/400-italic.css";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "./app.css";
import { Capacitor } from "@capacitor/core";
import App from "./App.svelte";

const app = mount(App, { target: document.getElementById("app")! });

if ("serviceWorker" in navigator && import.meta.env.PROD && !Capacitor.isNativePlatform()) {
  addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}

export default app;

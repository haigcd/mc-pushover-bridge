import { Rcon } from "rcon-client";
import { Logger } from "tslog";
import axios from "axios";
let Pushover = require("node-pushover");
let env = require("./env.json");

class Notifier {
  private logger: Logger = new Logger({ minLevel: "info" });
  private pushover;
  private currentPlayers: Array<string> = [];

  constructor() {
    this.pushover = new Pushover({
      token: env.pushover.api_key,
      user: env.pushover.user_key,
    });

    axios.defaults.headers.common[
      "Authorization"
    ] = `Bearer ${env.smartthings.bearer_token}`;
  }

  private async connect(): Promise<Rcon> {
    return await Rcon.connect({
      host: env.rcon.host,
      port: env.rcon.port,
      password: env.rcon.password,
    });
  }

  private async ding(): Promise<void> {
    const resp = await axios.post(
      env.smartthings.endpoint,
      JSON.stringify(env.smartthings.payload)
    );
  }

  async run(): Promise<void> {
    let rcon: Rcon;

    try {
      rcon = await this.connect();
    } catch (e) {
      this.logger.error("Connection failed: ", e);
      return;
    }

    const resp = await rcon.send("list");

    const newPlayerList = resp
      .slice(resp.indexOf(":") + 2)
      .split(",")
      .map((s) => s.trim());
    this.logger.debug(newPlayerList);

    const addedPlayers = newPlayerList.filter(
      (p) => !this.currentPlayers.includes(p)
    );

    if (addedPlayers.length > 0) {
      this.logger.info("Added these players: ", addedPlayers);
      this.pushover.send(
        `${addedPlayers.length} player(s) joined`,
        addedPlayers.toString()
      );
      // await this.ding();
    }

    const removedPlayers = this.currentPlayers.filter(
      (p) => !newPlayerList.includes(p)
    );

    if (removedPlayers.length > 0) {
      this.logger.info("Removed these players: ", removedPlayers);
      this.pushover.send(
        `${removedPlayers.length} player(s) left`,
        removedPlayers.toString()
      );
    }

    if (removedPlayers.length === 0 && addedPlayers.length === 0) {
      this.logger.debug("No players added or removed");
    }

    this.currentPlayers = newPlayerList;

    rcon.end();
  }
}

const notifier = new Notifier();

setInterval((_) => notifier.run(), 5000);

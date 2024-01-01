import { Rcon } from "rcon-client";
import { Logger } from "tslog";
import axios from "axios";
let Pushover = require("node-pushover");
let env = require("./env.json");

class Notifier {
  private logger: Logger = new Logger({ minLevel: env.general.log_level });
  private pushover;
  private currentPlayers: Array<string> = [];
  private rcon: Rcon | undefined;

  constructor() {
    this.pushover = new Pushover({
      token: env.pushover.api_key,
      user: env.pushover.user_key,
    });

    axios.defaults.headers.common[
      "Authorization"
    ] = `Bearer ${env.smartthings.bearer_token}`;
  }

  private async connectRcon(): Promise<Rcon> {
    this.logger.debug("Connecting to rcon...");

    return await Rcon.connect({
      host: env.rcon.host,
      port: env.rcon.port,
      password: env.rcon.password,
      timeout: env.rcon.timeout,
    });
  }

  private async ding(): Promise<void> {
    const resp = await axios.post(
      env.smartthings.endpoint,
      JSON.stringify(env.smartthings.payload)
    );
  }

  private push(addedPlayers: string[]): void {
    this.pushover.send(
      `${addedPlayers.length} player(s) joined`,
      addedPlayers.toString()
    );
  }

  async run(): Promise<void> {
    if (this.rcon === undefined) {
      this.logger.debug("Rcon connection not established, connecting...");
      try {
        this.rcon = await this.connectRcon();
        this.logger.debug("Rcon connection established");
      } catch (err) {
        this.logger.error("Could not establish rcon connection: ", err);
        return;
      }
    }

    let playerResp: string;
    try {
      playerResp = await this.rcon.send("list");
    } catch (err) {
      this.logger.error(
        "Failed to receive list of players, resetting connection..."
      );
      this.rcon.end();
      this.rcon = undefined;

      return;
    }

    this.logger.debug("Received list of players: ", playerResp);

    const newPlayerList = playerResp
      .slice(playerResp.indexOf(":") + 2)
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== "");

    this.logger.debug("New players: ", newPlayerList);

    const addedPlayers = newPlayerList.filter(
      (p) => !this.currentPlayers.includes(p)
    );

    if (addedPlayers.length > 0) {
      this.logger.info("Added these players: ", addedPlayers);

      if (env.general.push_on_join) {
        this.push(addedPlayers);
      }

      if (env.general.ding_on_join) {
        await this.ding();
      }
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
  }
}

const notifier = new Notifier();

// first run
notifier.run();

setInterval((_) => {
  try {
    notifier.run();
  } catch (error) {
    console.error(error);
  }
}, env.general.interval_ms);

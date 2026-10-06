import { rootServer, RootAppStartState } from "@rootsdk/server-app";
import { academyTrainingService } from "./academyTrainingService";

async function onStarting(state: RootAppStartState) {
  rootServer.lifecycle.addService(academyTrainingService);
}

(async () => {
  await rootServer.lifecycle.start(onStarting);
})();

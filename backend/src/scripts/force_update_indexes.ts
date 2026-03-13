import { updateAllIndexesFromBcb } from "../services/indexes";

async function run() {
    console.log("Forcing update of all indexes from BCB...");
    try {
        const results = await updateAllIndexesFromBcb();
        console.log("Updated indexes:", results);
        console.log("Done.");
    } catch (e) {
        console.error("Error updating indexes:", e);
    }
}

run();

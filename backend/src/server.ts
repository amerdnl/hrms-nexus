import "dotenv/config";
import app from "./app.js";

const port = Number(process.env.PORT) || 5000;

app.listen(port, () => {
  console.log(`HR Nexus API running on http://localhost:${port}`);
});

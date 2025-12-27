// app/lib/appwrite.client.ts
import { Client, Account, Databases } from "appwrite";

const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT as string | undefined;
const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID as string | undefined;

if (!endpoint || !projectId) {
  console.warn("[Appwrite] Missing VITE_APPWRITE_ENDPOINT or VITE_APPWRITE_PROJECT_ID");
}

export const client = new Client();

if (endpoint) client.setEndpoint(endpoint);
if (projectId) client.setProject(projectId);

export const account = new Account(client);
export const databases = new Databases(client);

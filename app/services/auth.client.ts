// app/services/auth.client.ts
import { ID } from "appwrite";
import { account } from "~/lib/appwrite.client";

export async function getCurrentUser() {
  try {
    return await account.get();
  } catch {
    return null;
  }
}

export async function loginEmailPassword(email: string, password: string) {
  return account.createEmailPasswordSession(email, password);
}

export async function registerEmailPassword(
  email: string,
  password: string,
  name?: string,
) {
  return account.create(ID.unique(), email, password, name);
}

export async function logoutCurrentSession() {
  try {
    await account.deleteSession("current");
  } catch {
    // ignore
  }
}

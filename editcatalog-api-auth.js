import { getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const nativeFetch = window.fetch.bind(window);

window.fetch = async function authenticatedCatalogFetch(input, init = {}) {
  const url = typeof input === "string" ? input : input?.url || "";
  const needsAdminToken = url.startsWith("/api/catalog-image-search") || url.startsWith("/api/catalog-image-fetch");

  if (!needsAdminToken) return nativeFetch(input, init);

  let auth;
  try {
    auth = getAuth(getApp("edit-catalog-admin"));
  } catch {
    return nativeFetch(input, init);
  }

  const user = auth.currentUser;
  if (!user) return nativeFetch(input, init);

  const token = await user.getIdToken();
  const headers = new Headers(init.headers || (typeof input !== "string" ? input.headers : undefined));
  headers.set("Authorization", `Bearer ${token}`);

  return nativeFetch(input, { ...init, headers });
};

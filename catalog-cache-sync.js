import { doc, getDocFromServer } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export async function refreshSpreadsheetCache(db, user, id) {
  try {
    const product = await getDocFromServer(doc(db, "liveproducts", id));
    const data = product.exists() ? product.data() : null;
    const token = await user.getIdToken();
    const response = await fetch("/api/catalog", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ id, product: data, updatedAt: data?.updatedAt?.toMillis?.() || Date.now() })
    });
    return response.ok;
  } catch {
    return false;
  }
}

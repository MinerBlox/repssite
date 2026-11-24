# Spreadsheet Admin catalogues

Live Spreadsheet items use the existing `liveproducts` collection and the public catalogue cache. Video Items use the separate `videoproducts` collection. Both catalogues use the same product fields. Adding to both saves one document per collection with the same ID. When editing a paired item, choosing both applies just the changed fields to each entry.

## Enable Video Items in Firestore

In the `reps-central` Firebase project, open **Firestore Database → Rules**. Add this match inside the existing `match /databases/{database}/documents` block and publish the rules. Keep the project's existing rules. Replace the UID placeholder with the same admin UID used by `spreadsheetadmin/admin-fast.js`.

```text
match /videoproducts/{itemId} {
  allow read: if true;
  allow create, update, delete: if request.auth != null
    && request.auth.uid == "YOUR_EXISTING_ADMIN_UID";
}
```

Video item documents are public because the Videos page reads them to show current item names, images, prices and links. Firestore creates the collection on the first successful add. In **Video Manager**, select **Video Items** in the item picker to link that version to a video. If a product is in both catalogues, the picker lets you switch which version the video uses.

[Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)

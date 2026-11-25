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

## Refresh the Video Items cache daily

1. Merge the updated **Build Product Cache** workflow into the repository’s default branch, `main`. GitHub runs scheduled workflows from the default branch.
2. Reuse the GitHub Actions secrets from the existing spreadsheet build. The workflow uses `FIREBASE_SERVICE_ACCOUNT`, `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_BUCKET_NAME`. Use the same R2 bucket as the Cloudflare Pages `CATALOG_INDEX_BUCKET` binding. The Firebase service account needs read access to `videoproducts`, and the R2 credentials need read and write access.
3. In GitHub, open **Actions → Build Product Cache → Run workflow**, select `main`, choose **video**, and run it once. This reads just Video Items and writes `catalog/video-products.json`. You can choose **all** for the first run if you also want to initialize the interaction sort cache.
4. Confirm that the run saved `catalog/video-products.json`. The next scheduled run will refresh both catalogues at 12:17 a.m. Pacific. Changes made in Spreadsheet Admin update the shared cache immediately. Changes made directly in Firestore appear after the next export.

To check that the build ran, open [the Video Items cache on dev](https://dev.repscentral.pages.dev/api/catalog?album=video) and look for a `generatedAt` timestamp. [GitHub Actions schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onschedule)

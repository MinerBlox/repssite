# Automatic TikTok upload detection

The Worker checks the connected creator's latest 20 public TikTok videos every five minutes, even when Video Manager is closed. It adds missing posts to **Awaiting Confirmation** with the caption, thumbnail and a title suggestion. Open a draft, name it, add its items and press **Go Live**. The Worker only writes drafts. It skips published posts and dismissed drafts by TikTok post ID.

## 1. Connect your TikTok account

1. In the [TikTok Developer Portal](https://developers.tiktok.com/), create or open your app. Enable Login Kit and Display API. Request `user.info.basic` and `video.list`, and submit the app for approval if required. Register an exact HTTPS redirect URL in Login Kit, such as your site's public Videos page. [TikTok's Display API setup](https://developers.tiktok.com/docs/en/display-api-get-started/)
2. Use the approved app to authorize the creator account that uploads the videos. Save the app's client key, client secret and resulting refresh token for Cloudflare. Reuse the existing refresh-token secret if you already connected the same app in Pages. [TikTok's web authorization flow](https://developers.tiktok.com/docs/en/login-kit-web)
3. If you need a refresh token, run this in PowerShell 7. Copy the full URL from the address bar after TikTok redirects you, then paste it into the masked prompt. The script checks OAuth state and copies only the refresh token to your clipboard so you can paste it into Cloudflare. Clear the clipboard after configuring the secrets.

   ```powershell
   $tikTokKey = Read-Host 'TikTok client key'
   $tikTokSecret = Read-Host 'TikTok client secret' -MaskInput
   $tikTokRedirect = Read-Host 'Exact registered HTTPS redirect URL'
   $tikTokState = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
   $tikTokAuthUrl = 'https://www.tiktok.com/v2/auth/authorize/?client_key=' +
     [uri]::EscapeDataString($tikTokKey) + '&response_type=code&scope=user.info.basic%2Cvideo.list&redirect_uri=' +
     [uri]::EscapeDataString($tikTokRedirect) + '&state=' + $tikTokState
   Start-Process $tikTokAuthUrl
   $tikTokReturn = [uri](Read-Host 'Full URL after TikTok redirects' -MaskInput)
   $tikTokQuery = @{}
   foreach ($part in ($tikTokReturn.Query.TrimStart('?') -split '&')) {
     $key, $value = $part -split '=', 2
     if ($key -and $null -ne $value) { $tikTokQuery[$key] = [uri]::UnescapeDataString($value.Replace('+', ' ')) }
   }
   if ($tikTokReturn.GetLeftPart('Path') -cne ([uri]$tikTokRedirect).GetLeftPart('Path') -or
       $tikTokQuery.state -cne $tikTokState -or !$tikTokQuery.code) {
     throw 'TikTok returned an unexpected redirect or did not authorize the app.'
   }
   $tikTokTokens = Invoke-RestMethod -Method Post -Uri 'https://open.tiktokapis.com/v2/oauth/token/' `
     -ContentType 'application/x-www-form-urlencoded' -Body @{
       client_key = $tikTokKey; client_secret = $tikTokSecret; code = $tikTokQuery.code
       grant_type = 'authorization_code'; redirect_uri = $tikTokRedirect
     }
   if (!$tikTokTokens.refresh_token -or ($tikTokTokens.scope -split ',') -notcontains 'video.list') {
     throw 'TikTok did not grant video.list. Check app approval and authorize again.'
   }
   Set-Clipboard -Value $tikTokTokens.refresh_token
   Remove-Variable tikTokSecret,tikTokTokens,tikTokReturn,tikTokQuery
   ```

## 2. Give the Worker a Firebase account

1. In Firebase Authentication for `reps-central`, create a dedicated **Email/Password** user with a unique generated password. Copy its UID. Use this account only for the Worker and keep it out of the site's admin allowlist.
2. In **Firestore Database → Rules**, add the following inside the existing `match /databases/{database}/documents` block, replacing the placeholder UID. Keep your existing rules. Firestore grants access when any matching allow rule passes, so these additive rules give the sync account read access to the two video collections and permission to create empty, unpublished drafts only. [Firestore Rules](https://firebase.google.com/docs/firestore/security/get-started)

   ```text
   function isTikTokInboxWorker() {
     return request.auth != null && request.auth.uid == "REPLACE_WITH_SYNC_USER_UID";
   }

   match /videos/{id} {
     allow read: if isTikTokInboxWorker();
   }

   match /videoDrafts/{id} {
     allow read: if isTikTokInboxWorker();
     allow create: if isTikTokInboxWorker()
       && request.resource.data.keys().hasOnly([
         "status", "tiktokId", "tiktokUrl", "title", "suggestedTitle", "caption",
         "thumbnailUrl", "postedAt", "captionAuto", "thumbnailAuto",
         "itemIds", "items", "createdAt", "updatedAt"
       ])
       && request.resource.data.status == "awaiting"
       && request.resource.data.tiktokId.matches("^[0-9]+$")
       && id == "tiktok-" + request.resource.data.tiktokId
       && request.resource.data.title == ""
       && request.resource.data.items == []
       && request.resource.data.itemIds == []
       && request.resource.data.createdAt == request.time
       && request.resource.data.updatedAt == request.time;
   }
   ```

   Your regular admin also needs its existing read/write access to `videoDrafts` to review, dismiss and publish drafts. If the Worker logs a Firestore 401 or 403, verify the sync UID and whether Firestore App Check enforcement is enabled for server requests. Keep enforcement settings intact while diagnosing.

## 3. Deploy the scheduled Worker

1. Check out the `dev` branch locally and open a terminal in `workers/tiktok-inbox`. In `wrangler.jsonc` replace `replace-with-private-video-bucket-name` with the **same private R2 bucket** bound as `VIDEO_MEDIA_BUCKET` in Cloudflare Pages. The Worker and Pages share OAuth refresh state in that bucket. Keep direct public R2 access disabled.
2. Run `npx wrangler login` and then `npx wrangler deploy`. In **Cloudflare → Workers & Pages → repscentral-tiktok-inbox → Settings → Variables and Secrets**, add the values below as secrets. You can also run `npx wrangler secret put NAME` for each value. [Cloudflare Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)

   | Name | Value |
   | --- | --- |
   | `TIKTOK_CLIENT_KEY` | TikTok app client key |
   | `TIKTOK_CLIENT_SECRET` | TikTok app client secret |
   | `TIKTOK_REFRESH_TOKEN` | The creator's refresh token |
   | `FIREBASE_WEB_API_KEY` | Web API key for the existing Firebase project, from Firebase Project settings |
   | `FIREBASE_SYNC_EMAIL` | Dedicated Firebase Authentication user email |
   | `FIREBASE_SYNC_PASSWORD` | Dedicated Firebase Authentication user password |

3. If the admin's **Check TikTok now** button also needs configuring, add the same three TikTok secrets to the relevant Cloudflare Pages environment and redeploy Pages. Where both services are configured, use the same OAuth seed and R2 bucket in both services. If you want the first run to skip older uploads, set `TIKTOK_IMPORT_AFTER` as an optional text variable in both environments before enabling them. Use an ISO timestamp such as `2026-11-23T21:00:00Z`. Without a cutoff, the first run can queue missing posts from the most recent 20.
4. Check the Worker's **Observability → Logs** after the next five-minute run. Open **Video Manager → View Videos → Awaiting Confirmation** to review the results. Cloudflare notes that Cron Trigger configuration changes may take up to 15 minutes to propagate. [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)

The Worker monitors the public video feed available through TikTok's Display API. Private posts and photo posts absent from that feed can still be added manually with a supported public link where available.

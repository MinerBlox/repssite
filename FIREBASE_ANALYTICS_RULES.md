# Firestore Rules

Paste this complete ruleset into Firebase Console, then click **Publish**.

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    function isAdmin() {
      return request.auth != null
        && request.auth.uid == "3jC9pWkF5ZeHIDtd1LrPR1Ptvbz1";
    }

    match /products/{id} {
      allow read: if true;
      allow write: if isAdmin();
    }

    match /categories/{id} {
      allow read, write: if isAdmin();
    }

    match /analyticsTotals/{documentId} {
      allow read: if isAdmin();

      allow create: if documentId == "summary"
        && request.resource.data.keys().hasOnly([
          "totalVisits", "updatedAt"
        ])
        && request.resource.data.totalVisits == 1
        && request.resource.data.updatedAt == request.time;

      allow update: if documentId == "summary"
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          "totalVisits", "updatedAt"
        ])
        && request.resource.data.totalVisits
          == resource.data.totalVisits + 1
        && request.resource.data.updatedAt == request.time;
    }

    match /analyticsPages/{pageId} {
      allow read: if isAdmin();

      function isKnownPage() {
        return pageId in [
          "home",
          "spreadsheet",
          "quality-checks",
          "link-converter",
          "agents",
          "item-pages",
          "not-found"
        ];
      }

      allow create: if isKnownPage()
        && request.resource.data.keys().hasOnly([
          "name", "path", "totalVisits", "updatedAt"
        ])
        && request.resource.data.name is string
        && request.resource.data.name.size() <= 40
        && request.resource.data.path is string
        && request.resource.data.path.size() <= 200
        && request.resource.data.totalVisits == 1
        && request.resource.data.updatedAt == request.time;

      allow update: if isKnownPage()
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          "name", "path", "totalVisits", "updatedAt"
        ])
        && request.resource.data.name is string
        && request.resource.data.name.size() <= 40
        && request.resource.data.path is string
        && request.resource.data.path.size() <= 200
        && request.resource.data.totalVisits
          == resource.data.totalVisits + 1
        && request.resource.data.updatedAt == request.time;
    }

    match /analyticsDaily/{dateId} {
      allow read: if isAdmin();

      function validDateId() {
        return dateId.matches("^\\d{4}-\\d{2}-\\d{2}$");
      }

      allow create: if validDateId()
        && request.resource.data.keys().hasOnly([
          "date", "totalVisits", "updatedAt"
        ])
        && request.resource.data.date == dateId
        && request.resource.data.totalVisits == 1
        && request.resource.data.updatedAt == request.time;

      allow update: if validDateId()
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          "totalVisits", "updatedAt"
        ])
        && request.resource.data.date == resource.data.date
        && request.resource.data.totalVisits
          == resource.data.totalVisits + 1
        && request.resource.data.updatedAt == request.time;
    }

    match /analyticsPresence/{visitorId} {
      allow read: if isAdmin();

      function validPresence() {
        return visitorId.matches("^[0-9a-f-]{36}$")
          && request.resource.data.pageId in [
            "home",
            "spreadsheet",
            "quality-checks",
            "link-converter",
            "agents",
            "item-pages",
            "not-found"
          ]
          && request.resource.data.pageName is string
          && request.resource.data.pageName.size() <= 40
          && request.resource.data.path is string
          && request.resource.data.path.size() <= 200;
      }

      allow create, update: if validPresence()
        && request.resource.data.keys().hasOnly([
          "pageId",
          "pageName",
          "path",
          "lastSeen",
          "expiresAt"
        ])
        && request.resource.data.lastSeen == request.time
        && request.resource.data.expiresAt is timestamp;
    }

    match /analyticsProducts/{productId} {
      allow read: if true;

      function productExists() {
        return exists(
          /databases/$(database)/documents/products/$(productId)
        );
      }

      allow create: if productExists()
        && request.resource.data.keys().hasOnly([
          "totalInteractions",
          "viewClicks",
          "copyClicks",
          "detailViews",
          "outboundClicks",
          "updatedAt"
        ])
        && request.resource.data.keys().hasAll([
          "totalInteractions",
          "viewClicks",
          "copyClicks",
          "detailViews",
          "outboundClicks",
          "updatedAt"
        ])
        && request.resource.data.totalInteractions == 1
        && request.resource.data.viewClicks
          + request.resource.data.copyClicks
          + request.resource.data.detailViews
          + request.resource.data.outboundClicks == 1
        && request.resource.data.updatedAt == request.time;

      allow update: if productExists()
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          "totalInteractions",
          "viewClicks",
          "copyClicks",
          "detailViews",
          "outboundClicks",
          "updatedAt"
        ])
        && request.resource.data.totalInteractions
          == resource.data.totalInteractions + 1
        && request.resource.data.viewClicks >= resource.data.viewClicks
        && request.resource.data.viewClicks
          <= resource.data.viewClicks + 1
        && request.resource.data.copyClicks >= resource.data.copyClicks
        && request.resource.data.copyClicks
          <= resource.data.copyClicks + 1
        && request.resource.data.detailViews >= resource.data.detailViews
        && request.resource.data.detailViews
          <= resource.data.detailViews + 1
        && request.resource.data.outboundClicks
          >= resource.data.outboundClicks
        && request.resource.data.outboundClicks
          <= resource.data.outboundClicks + 1
        && request.resource.data.viewClicks
          + request.resource.data.copyClicks
          + request.resource.data.detailViews
          + request.resource.data.outboundClicks
          == resource.data.viewClicks
          + resource.data.copyClicks
          + resource.data.detailViews
          + resource.data.outboundClicks + 1
        && request.resource.data.updatedAt == request.time;
    }
  }
}
```

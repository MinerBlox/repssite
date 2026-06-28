# Firebase Analytics Rules

Add these match blocks inside your existing:

```text
match /databases/{database}/documents {
  // Paste the blocks here.
}
```

Do not replace your existing product, category, or admin rules.

```javascript
match /analyticsTotals/{documentId} {
  allow read: if request.auth != null;

  function isSummary() {
    return documentId == "summary";
  }

  allow create: if isSummary()
    && request.resource.data.keys().hasOnly([
      "totalVisits", "updatedAt"
    ])
    && request.resource.data.totalVisits == 1
    && request.resource.data.updatedAt == request.time;

  allow update: if isSummary()
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
      "totalVisits", "updatedAt"
    ])
    && request.resource.data.totalVisits == resource.data.totalVisits + 1
    && request.resource.data.updatedAt == request.time;
}

match /analyticsPages/{pageId} {
  allow read: if request.auth != null;

  function isKnownPage() {
    return pageId in [
      "home", "spreadsheet", "quality-checks", "link-converter",
      "agents", "item-pages", "not-found"
    ];
  }

  allow create: if isKnownPage()\n    && request.resource.data.keys().hasOnly([
      "name", "path", "totalVisits", "updatedAt"
    ])
    && request.resource.data.name is string\n    && request.resource.data.name.size() <= 40\n    && request.resource.data.name.size() <= 40
    && request.resource.data.path is string\n    && request.resource.data.path.size() <= 200\n    && request.resource.data.path.size() <= 200
    && request.resource.data.totalVisits == 1
    && request.resource.data.updatedAt == request.time;

  allow update: if isKnownPage()\n    && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
      "name", "path", "totalVisits", "updatedAt"
    ])
    && request.resource.data.name is string
    && request.resource.data.path is string
    && request.resource.data.totalVisits == resource.data.totalVisits + 1
    && request.resource.data.updatedAt == request.time;
}

match /analyticsPresence/{visitorId} {
  allow read: if request.auth != null;

  function validPresence() {
    return visitorId.matches("^[0-9a-f-]{36}$")
      && request.resource.data.pageId in [
        "home", "spreadsheet", "quality-checks", "link-converter",
        "agents", "item-pages", "not-found"
      ]
      && request.resource.data.pageName.size() <= 40
      && request.resource.data.path.size() <= 200;
  }

  allow create, update: if validPresence()
    && request.resource.data.keys().hasOnly([
      "pageId", "pageName", "path", "lastSeen"
    ])
    && request.resource.data.pageId is string
    && request.resource.data.pageName is string
    && request.resource.data.path is string
    && request.resource.data.lastSeen == request.time;
}

match /analyticsProducts/{productId} {
  allow read: if true;

  function productExists() {
    return exists(/databases/$(database)/documents/products/$(productId));
  }

  allow create: if productExists()\n    && request.resource.data.keys().hasOnly([
      "totalInteractions", "viewClicks", "copyClicks",
      "detailViews", "outboundClicks", "updatedAt"
    ])
    && request.resource.data.keys().hasAll([
      "totalInteractions", "viewClicks", "copyClicks",
      "detailViews", "outboundClicks", "updatedAt"
    ])
    && request.resource.data.totalInteractions == 1
    && request.resource.data.viewClicks
      + request.resource.data.copyClicks
      + request.resource.data.detailViews
      + request.resource.data.outboundClicks == 1
    && request.resource.data.updatedAt == request.time;

  allow update: if productExists()\n    && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
      "totalInteractions", "viewClicks", "copyClicks",
      "detailViews", "outboundClicks", "updatedAt"
    ])
    && request.resource.data.totalInteractions == resource.data.totalInteractions + 1
    && request.resource.data.viewClicks >= resource.data.viewClicks
    && request.resource.data.viewClicks <= resource.data.viewClicks + 1
    && request.resource.data.copyClicks >= resource.data.copyClicks
    && request.resource.data.copyClicks <= resource.data.copyClicks + 1
    && request.resource.data.detailViews >= resource.data.detailViews
    && request.resource.data.detailViews <= resource.data.detailViews + 1
    && request.resource.data.outboundClicks >= resource.data.outboundClicks
    && request.resource.data.outboundClicks <= resource.data.outboundClicks + 1
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
```

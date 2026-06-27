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

  allow create: if request.resource.data.keys().hasOnly([
      "totalVisits", "updatedAt"
    ])
    && request.resource.data.totalVisits == 1
    && request.resource.data.updatedAt == request.time;

  allow update: if request.resource.data.diff(resource.data).affectedKeys().hasOnly([
      "totalVisits", "updatedAt"
    ])
    && request.resource.data.totalVisits == resource.data.totalVisits + 1
    && request.resource.data.updatedAt == request.time;
}

match /analyticsPages/{pageId} {
  allow read: if request.auth != null;

  allow create: if request.resource.data.keys().hasOnly([
      "name", "path", "totalVisits", "updatedAt"
    ])
    && request.resource.data.name is string
    && request.resource.data.path is string
    && request.resource.data.totalVisits == 1
    && request.resource.data.updatedAt == request.time;

  allow update: if request.resource.data.diff(resource.data).affectedKeys().hasOnly([
      "name", "path", "totalVisits", "updatedAt"
    ])
    && request.resource.data.name is string
    && request.resource.data.path is string
    && request.resource.data.totalVisits == resource.data.totalVisits + 1
    && request.resource.data.updatedAt == request.time;
}

match /analyticsPresence/{visitorId} {
  allow read: if request.auth != null;

  allow create, update: if request.resource.data.keys().hasOnly([
      "pageId", "pageName", "path", "lastSeen"
    ])
    && request.resource.data.pageId is string
    && request.resource.data.pageName is string
    && request.resource.data.path is string
    && request.resource.data.lastSeen == request.time;
}
```

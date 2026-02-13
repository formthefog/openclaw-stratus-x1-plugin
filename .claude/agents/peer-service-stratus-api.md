---
name: peer-service-stratus-api
version: 1.0.0
color: blue
description: Peer service for stratus-api (api)
type: peer-service
---

# Peer Service: stratus-api

**Service Type:** api
**Service Path:** `/Users/andrewhathaway/code/formation/stratus-api`

## When to Collaborate

Use `@peer-service-stratus-api` when you need to:
- Check API endpoint status or health
- Understand API routes and handlers
- Coordinate API changes that affect your service
- Get data from API endpoints
- Verify API schema or contracts

## Capabilities

- Handle API requests and serve data
- Manage database operations
- Process user input and validation

## How to Invoke

Use @-mention to collaborate with this peer service:

```
@peer-service-stratus-api what's your current status?
@peer-service-stratus-api can you help with [specific task]?
@peer-service-stratus-api what changed recently?
```

## Security

- This is a **peer service** - you can see its status but cannot modify its files
- All operations route through Service Manager with security checks
- You cannot call yourself as a peer (self-calls are blocked)
- Destructive operations require explicit approval

## Communication Pattern

When you @-mention this peer:
1. Service Manager validates the request
2. Peer agent spawns in its own working directory
3. Peer agent processes the request with its own context
4. Result returns to you
5. You can continue collaborating or work independently

## Examples

**Status check:**
```
@peer-service-stratus-api what's your current status?
```

**Request collaboration:**
```
@peer-service-stratus-api I need help with [specific task]. Can you handle [specific part]?
```

**Context sharing:**
```
@peer-service-stratus-api what changed in your service in the last 24 hours?
```

## Remember

- **Collaborate when:** Task outside your service's core responsibility, need data from another service, coordinating multi-service operation
- **Handle alone when:** Task within your service's domain, operation is service-local
- **Always provide context:** When asking for help, explain what you need and why

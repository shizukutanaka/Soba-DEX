# Operational Runbooks

Production operational procedures for Python microservices.

## Incident Response Procedures

### Procedure 1: Service Restart

**Trigger:** Service health check failing or performance degradation
**Owner:** On-call engineer
**Duration:** 10 minutes

#### Steps

```bash
# 1. Verify service status
curl http://localhost:3000/api/health/service/SERVICE_NAME

# 2. Get current pod status
kubectl get pods -n python-services -l app=SERVICE_NAME

# 3. Check recent logs
kubectl logs deployment/SERVICE_NAME -n python-services --tail=100

# 4. Drain pod for graceful shutdown
kubectl drain $(kubectl get nodes -l app=SERVICE_NAME -o jsonpath='{.items[0].metadata.name}') \
  --ignore-daemonsets --delete-emptydir-data

# 5. Restart deployment
kubectl rollout restart deployment/SERVICE_NAME -n python-services

# 6. Monitor rollout
kubectl rollout status deployment/SERVICE_NAME -n python-services

# 7. Verify health
kubectl exec -it $(kubectl get pod -l app=SERVICE_NAME -n python-services -o jsonpath='{.items[0].metadata.name}') \
  -n python-services -- curl http://localhost:8001/health

# 8. Test functionality
curl -X POST http://localhost:3000/api/python/ENDPOINT \
  -H "Content-Type: application/json" \
  -d '{test data}'
```

#### Rollback (if needed)

```bash
kubectl rollout undo deployment/SERVICE_NAME -n python-services
kubectl rollout status deployment/SERVICE_NAME -n python-services
```

---

### Procedure 2: Scale Service

**Trigger:** High load, approaching capacity limits
**Owner:** DevOps engineer
**Duration:** 5 minutes

#### Manual Scaling

```bash
# 1. Check current replicas
kubectl get deployment SERVICE_NAME -n python-services

# 2. Check HPA status
kubectl get hpa -n python-services

# 3. Manual scale if needed
kubectl scale deployment/SERVICE_NAME \
  --replicas=10 \
  -n python-services

# 4. Verify scaling
kubectl get deployment SERVICE_NAME -n python-services
kubectl get pods -n python-services -l app=SERVICE_NAME

# 5. Monitor metrics
watch 'kubectl get pods -n python-services -l app=SERVICE_NAME && echo && kubectl top pods -n python-services -l app=SERVICE_NAME'
```

#### HPA Configuration

```bash
# Update HPA target utilization
kubectl patch hpa SERVICE_NAME -n python-services -p \
  '{"spec":{"targetCPUUtilizationPercentage":60}}'

# Get HPA status
kubectl describe hpa SERVICE_NAME -n python-services
```

---

### Procedure 3: Database Troubleshooting

**Trigger:** Database connection errors, slow queries
**Owner:** Database administrator
**Duration:** 15 minutes

#### Diagnosis

```bash
# 1. Test connection
psql -U soba_dex -d soba_dex -c "SELECT now();"

# 2. Check active connections
psql -U postgres -d soba_dex -c "SELECT count(*) FROM pg_stat_activity;"

# 3. Check slow queries
psql -U postgres -d soba_dex -c "SELECT query, calls, total_time FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;"

# 4. Monitor replication (if applicable)
psql -U postgres -c "SELECT slot_name, restart_lsn FROM pg_replication_slots;"
```

#### Resolution

```bash
# Increase pool size if needed
# Edit backend/config/database.js and restart services

# Kill long-running queries
psql -U postgres -d soba_dex -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='soba_dex' AND state='active' AND query_start < now() - interval '30 minutes';"

# Reindex tables if slow
REINDEX TABLE table_name;
```

---

### Procedure 4: Memory/CPU Issues

**Trigger:** High resource utilization, OOM errors
**Owner:** On-call engineer
**Duration:** 20 minutes

#### Diagnosis

```bash
# 1. Check node resources
kubectl top nodes

# 2. Check pod resources
kubectl top pods -n python-services

# 3. Check pod limits
kubectl get pods -n python-services -o custom-columns=NAME:.metadata.name,CPU_REQ:.spec.containers[].resources.requests.cpu,MEM_REQ:.spec.containers[].resources.requests.memory

# 4. Check for memory leaks
kubectl logs deployment/SERVICE_NAME -n python-services | grep -i memory

# 5. Check events
kubectl get events -n python-services --sort-by='.lastTimestamp' | tail -20
```

#### Resolution

```bash
# Option 1: Increase pod limits
kubectl set resources deployment/SERVICE_NAME \
  --limits=cpu=2,memory=4Gi \
  --requests=cpu=500m,memory=2Gi \
  -n python-services

# Option 2: Reduce load
kubectl scale deployment/SERVICE_NAME --replicas=2 -n python-services

# Option 3: Add node capacity
# Contact infrastructure team to add nodes

# Option 4: Restart pod
kubectl delete pod -l app=SERVICE_NAME -n python-services
```

---

### Procedure 5: Network Issues

**Trigger:** Service-to-service communication failures
**Owner:** Network engineer
**Duration:** 10 minutes

#### Diagnosis

```bash
# 1. Check service connectivity
kubectl run -it --rm debug --image=curlimages/curl -- \
  curl http://SERVICE_NAME-service.python-services.svc.cluster.local:8001/health

# 2. Check endpoints
kubectl get endpoints -n python-services

# 3. Check network policies
kubectl get networkpolicies -n python-services

# 4. Check DNS resolution
kubectl run -it --rm debug --image=busybox -- \
  nslookup SERVICE_NAME-service.python-services

# 5. Check ingress
kubectl get ingress -n python-services
```

#### Resolution

```bash
# Check network policies
kubectl describe networkpolicies -n python-services

# Temporarily disable network policies for testing
kubectl delete networkpolicies -n python-services

# Fix DNS (if needed)
kubectl scale deployment/coredns -n kube-system --replicas=3

# Restart networking
kubectl delete pod -n kube-system -l k8s-app=kube-dns
```

---

## Maintenance Procedures

### Daily Maintenance

**Time:** 30 minutes
**Owner:** On-call engineer

```bash
#!/bin/bash

echo "=== Daily Maintenance ==="

# 1. Check service health
echo "Checking service health..."
curl -s http://localhost:3000/api/python/health | jq

# 2. Check metrics
echo "Checking metrics..."
curl -s http://localhost:3000/api/health/metrics | jq '.metrics | keys'

# 3. Check alerts
echo "Checking alerts..."
curl -s http://localhost:3000/api/dashboard/alerts | jq

# 4. Check pod restarts
echo "Checking pod restarts..."
kubectl get pods -n python-services -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.containerStatuses[*].restartCount}{"\n"}{end}'

# 5. Review logs for errors
echo "Checking for errors in last hour..."
kubectl logs -n python-services --since=1h | grep -i error | tail -20
```

### Weekly Maintenance

**Time:** 1-2 hours
**Owner:** DevOps engineer

```bash
# 1. Update dependencies
npm update
pip install --upgrade -r python/requirements.txt

# 2. Run full test suite
npm test
pytest python/tests/test_services.py -v

# 3. Performance review
# Check metrics in Grafana for anomalies

# 4. Backup verification
velero backup describe python-services-backup

# 5. Security scan
trivy image soba-dex/python-services:latest
npm audit

# 6. Disk space check
df -h
kubectl get pvc -n python-services
```

### Monthly Maintenance

**Time:** 4 hours
**Owner:** DevOps + database team

```bash
# 1. Database maintenance
VACUUM ANALYZE;
REINDEX DATABASE soba_dex;

# 2. Log rotation
# Verify log rotation configured in Logstash/ELK

# 3. Certificate rotation
# Check SSL certificate expiry
openssl x509 -in /path/to/cert.pem -noout -dates

# 4. Disaster recovery drill
# Simulate backup restoration in test environment

# 5. Capacity planning review
# Analyze metrics trends, plan for growth

# 6. Documentation update
# Update runbooks based on incidents
```

---

## Escalation Procedures

### Level 1 Escalation

**Condition:** Service degradation (error rate 2-5%)
**Action:** On-call engineer investigates and implements fix

```bash
# Typical investigation
curl http://localhost:3000/api/health/service/SERVICE_NAME
kubectl logs deployment/SERVICE_NAME -n python-services
kubectl describe pod <pod-name> -n python-services
```

### Level 2 Escalation

**Condition:** Service unavailability (error rate >5%)
**Action:** Escalate to service owner

```bash
# Service owner steps
1. Check recent deployments: git log --oneline -10
2. Review recent changes: git diff HEAD~5
3. Check metrics: Grafana dashboard
4. Consider rollback if recent changes
```

### Level 3 Escalation

**Condition:** Multiple services down, infrastructure issue
**Action:** Escalate to platform/infrastructure team

```bash
# Infrastructure team steps
1. Check cluster health: kubectl get nodes
2. Check etcd health: kubectl get --raw /livez
3. Check resources: kubectl top nodes, kubectl top pods
4. Check events: kubectl get events -A --sort-by='.lastTimestamp'
```

---

## Runbook Templates

### Service Health Check Template

```bash
#!/bin/bash
SERVICE=$1

echo "Health check for $SERVICE..."

# Check pod status
echo "Pod status:"
kubectl get pods -l app=$SERVICE -n python-services

# Check service status
echo "Service status:"
curl http://localhost:3000/api/health/service/$SERVICE

# Check recent logs
echo "Recent logs:"
kubectl logs deployment/$SERVICE -n python-services --tail=20

# Check metrics
echo "Metrics:"
curl http://localhost:3000/api/health/metrics | jq ".metrics.$SERVICE"
```

### Deployment Template

```bash
#!/bin/bash
SERVICE=$1
VERSION=$2

echo "Deploying $SERVICE v$VERSION..."

# Update image
kubectl set image deployment/$SERVICE \
  $SERVICE=soba-dex/python-services:$VERSION \
  -n python-services

# Monitor rollout
kubectl rollout status deployment/$SERVICE -n python-services

# Verify health
kubectl exec -it $(kubectl get pod -l app=$SERVICE -n python-services -o jsonpath='{.items[0].metadata.name}') \
  -n python-services -- curl http://localhost:8001/health

echo "Deployment complete!"
```

---

## Communication Templates

### Incident Notification

Subject: INCIDENT: Service Outage - SERVICE_NAME

```
Priority: P1 (Critical)
Severity: High
Status: Investigating
Service: SERVICE_NAME
Start Time: 2025-11-01 12:00 UTC

Description:
SERVICE_NAME is experiencing high error rates (>10% errors)
Users may experience delays or failures when accessing SERVICE functionality.

Impact:
- Estimated 1000+ users affected
- Revenue impact: ~$500/hour

Actions:
- Investigating root cause
- Attempting automatic recovery
- Will update every 15 minutes

Updates:
12:05 - Restarted SERVICE_NAME pods
12:10 - Service status: Recovering (error rate 5%)
12:15 - Service status: Normal (error rate <1%)

Resolution Time: 15 minutes
Root Cause: Memory leak in recent deployment

Next Steps:
- Rollback deployment
- Code review
- Redeploy with fix
```

---

## Post-Incident Review Template

**Incident ID:** INC-2025-001
**Date:** November 1, 2025
**Duration:** 15 minutes

### Timeline

| Time | Event |
|------|-------|
| 12:00 | Alerts triggered for high error rate |
| 12:01 | On-call engineer notified |
| 12:03 | Investigation begins |
| 12:05 | Root cause identified: memory leak |
| 12:06 | Pods restarted |
| 12:15 | Service recovered |

### Root Cause

Memory leak in recent deployment. Suspected issue in ML model loading.

### Resolution

Restarted affected pods. Memory usage normalized.

### Preventive Actions

1. Add memory monitoring alert (threshold: 90%)
2. Implement memory limit enforcement
3. Review ML model loading code
4. Add integration test for memory usage

---

**Last Updated:** November 1, 2025
**Version:** 1.0.0

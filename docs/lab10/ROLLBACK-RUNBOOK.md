# Runbook - production deploy of taskflow-api failed

Scope: the `Blue/Green Deploy` or `Deploy - Production` stage of the `taskflow-api` pipeline failed,
or users report errors right after a deploy. Run from a machine with `kubectl` pointed at the kind
cluster (`kubectl config use-context kind-kind`). All objects live in namespace `default`.

## 1. Find out which colour is live (1 min)

```powershell
kubectl get svc taskflow -o jsonpath="{.spec.selector.color}"; echo ""
kubectl get deploy taskflow-blue taskflow-green -o wide
kubectl get pods -l app=taskflow -o wide
```

- The pipeline already rolls back automatically when the new colour fails its rollout or smoke test
  (console shows `ROLLBACK: pointing Service taskflow back to <colour>`). If you see that line,
  go to step 3 to verify, then step 5.

## 2. Roll back by hand (if the pipeline did not, or the problem appeared after the switch)

Let `LIVE` be the colour from step 1 (the bad one) and `PREV` the other colour.

```powershell
$LIVE = kubectl get svc taskflow -o jsonpath="{.spec.selector.color}"
$PREV = if ($LIVE -eq "blue") { "green" } else { "blue" }

# 2a. Check the previous colour is still healthy before sending traffic to it
kubectl rollout status deployment/taskflow-$PREV --timeout=60s

# 2b. Switch the Service back (instant, no pod restarts)
kubectl patch svc taskflow -p "{\"spec\":{\"selector\":{\"color\":\"$PREV\"}}}"

# 2c. Put the bad colour back on its previous image
kubectl rollout undo deployment/taskflow-$LIVE
```

If the previous colour is also unhealthy, redeploy the last known-good image:

```powershell
# last good tag = commit SHA of the last green production build in Jenkins,
# or list what the registry has:
curl.exe -s http://localhost:5001/v2/taskflow-api/tags/list
kubectl set image deployment/taskflow-$PREV app=localhost:5001/taskflow-api:<good-sha>
kubectl rollout status deployment/taskflow-$PREV --timeout=120s
kubectl patch svc taskflow -p "{\"spec\":{\"selector\":{\"color\":\"$PREV\"}}}"
```

## 3. Verify (2 min)

```powershell
kubectl port-forward svc/taskflow 8080:8080
# in another window:
curl.exe -sf http://localhost:8080/health/live
curl.exe -sf http://localhost:8080/rooms
```

Both must return HTTP 200. Check Grafana "Lab 09 - Jenkins Pipeline SLO" and Prometheus Alerts.

## 4. Stop further deploys until fixed

- Do not approve any pending `Deploy - Production` input (click **Abort**).
- The Pipeline Health Gate will keep blocking main while the build success rate is below 90%.

## 5. Follow up

- Collect evidence: failed build console, `reports/svc-before.yaml`, `svc-after.yaml`,
  `svc-after-rollback.yaml` (archived artifacts), `kubectl logs deploy/taskflow-$LIVE --previous`.
- Revert the offending commit on `main` (`git revert <sha>`), push, and let the pipeline redeploy.
- Write a short blameless post-incident note: trigger, detection time, rollback time, root cause, fix.

# Lab 09 - Pipeline SLO (taskflow-k8s)

| Item | Definition |
|---|---|
| Service | Jenkins job `taskflow-k8s` (CI stages of taskflow-api on Kubernetes pod agents) |
| SLI | Build success ratio = successful builds / (successful + failed builds); aborted builds excluded |
| SLO | >= 90% over a rolling 30-minute window (lab-sized; production would use 7 or 28 days) |
| Error budget | 10% of builds in the window may fail |
| Alert | `TaskflowPipelineSLOBreach`: ratio < 90% with at least 3 builds in the window, for 1 minute |
| Supporting signals | `JenkinsQueueBacklog` (queue > 2 for 2m: agent pods not starting), `TaskflowPipelineLastBuildFailed` |

Drill: run 2 normal builds, then 3 builds with `SIMULATE_FAILURE=true`. The ratio drops to 40%, the
alert goes Pending and then Firing about 1 minute later, and it resolves after successful builds push
the ratio back above 90% (or the failures age out of the 30-minute window).

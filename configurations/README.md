# Scenario configurations

The simulator stores each published scenario in this folder as `<scenario-name>.json`. These are public, versioned input snapshots suitable for comparison, scripts, and analysis. Scores are recalculated by the current simulator model when loaded, rather than stored in the JSON.

Open **Save or load a configuration** on the site to load a public scenario. Publishing or updating a file requires a fine-grained GitHub personal access token restricted to this repository with **Contents: Read and write** permission. The token is held in the browser tab's memory and is never written into the JSON. Do not include personal information in the editable household examples. Existing saves in your browser stay there until you publish them individually.

Changes limited to this folder do not trigger the Pages build. The site reads the `main` branch through GitHub's Contents API, so a published file becomes available through **Refresh list** without a deployment. Changes to the simulator code still run the normal build, tests, and deployment.

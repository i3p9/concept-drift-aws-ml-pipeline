#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
AMPLIFY_APP_ID="drhf885uq82k8"
AMPLIFY_BRANCH="main"

# Lambda function name -> local folder mapping
declare -A LAMBDAS=(
  ["ingest-sales"]="ingest"
  ["feature-engineering"]="feature_engineering"
  ["retrain-model"]="retrain"
  ["inference"]="inference"
)

usage() {
  echo "Usage: $0 [all|lambdas|frontend|<lambda-name>]"
  echo ""
  echo "  all        Deploy lambdas + frontend"
  echo "  lambdas    Deploy all 4 lambdas"
  echo "  frontend   Build and deploy frontend to Amplify"
  echo "  <name>     Deploy a single lambda (ingest-sales, feature-engineering, retrain-model, inference)"
  echo ""
  echo "Examples:"
  echo "  $0 all"
  echo "  $0 frontend"
  echo "  $0 retrain-model"
  exit 1
}

deploy_lambda() {
  local func_name="$1"
  local folder="${LAMBDAS[$func_name]}"
  local lambda_dir="$PROJECT_DIR/lambdas/$folder"
  local zip_path="$lambda_dir/${folder}.zip"

  echo "--- Deploying lambda: $func_name ---"

  # Zip the handler
  (cd "$lambda_dir" && zip -j "$zip_path" handler.py)

  aws lambda update-function-code \
    --function-name "$func_name" \
    --zip-file "fileb://$zip_path" \
    --no-cli-pager \
    --output text \
    --query 'FunctionName'

  echo "  ✓ $func_name deployed"
}

deploy_all_lambdas() {
  for func_name in "${!LAMBDAS[@]}"; do
    deploy_lambda "$func_name"
  done
  echo ""
  echo "All lambdas deployed."
}

deploy_frontend() {
  local frontend_dir="$PROJECT_DIR/frontend"

  echo "--- Building frontend ---"
  (cd "$frontend_dir" && npm run build)

  echo "--- Zipping dist ---"
  local zip_path="$frontend_dir/dist.zip"
  (cd "$frontend_dir/dist" && zip -r "$zip_path" .)

  echo "--- Creating Amplify deployment ---"
  local deploy_json
  deploy_json=$(aws amplify create-deployment \
    --app-id "$AMPLIFY_APP_ID" \
    --branch-name "$AMPLIFY_BRANCH" \
    --output json)

  local job_id upload_url
  job_id=$(echo "$deploy_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['jobId'])")
  upload_url=$(echo "$deploy_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['zipUploadUrl'])")

  echo "--- Uploading to Amplify ---"
  curl -sS --upload-file "$zip_path" "$upload_url" > /dev/null

  aws amplify start-deployment \
    --app-id "$AMPLIFY_APP_ID" \
    --branch-name "$AMPLIFY_BRANCH" \
    --job-id "$job_id" \
    --no-cli-pager \
    --output text \
    --query 'jobSummary.status'

  rm "$zip_path"
  echo "  ✓ Frontend deployed (job $job_id)"
  echo "  https://main.$AMPLIFY_APP_ID.amplifyapp.com"
}

# --- Main ---
[[ $# -eq 0 ]] && usage

case "$1" in
  all)
    deploy_all_lambdas
    deploy_frontend
    ;;
  lambdas)
    deploy_all_lambdas
    ;;
  frontend)
    deploy_frontend
    ;;
  -h|--help)
    usage
    ;;
  *)
    if [[ -v "LAMBDAS[$1]" ]]; then
      deploy_lambda "$1"
    else
      echo "Unknown target: $1"
      usage
    fi
    ;;
esac

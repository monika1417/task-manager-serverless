#!/bin/bash
# =============================================================================
#  Lambda Microservice — Build & Deploy Script
#  Run from: Backend/lambda_microservice/
# =============================================================================

set -e  # exit immediately on error

echo "============================================="
echo " Task Manager Lambda — Build & Deploy"
echo "============================================="

# ── 1. Clean previous build ─────────────────────────────────────
echo "[1/5] Cleaning old build..."
rm -rf package lambda_function.zip
mkdir -p package

# ── 2. Install dependencies into ./package ──────────────────────
echo "[2/5] Installing dependencies..."
pip install -r requirements.txt -t ./package --quiet

# ── 3. Copy handler into the package ────────────────────────────
echo "[3/5] Copying handler.py..."
cp handler.py ./package/

# ── 4. Zip everything ───────────────────────────────────────────
echo "[4/5] Creating lambda_function.zip..."
cd package
zip -r ../lambda_function.zip . -q
cd ..

echo ""
echo "✅  Build complete!"
echo "    File: $(pwd)/lambda_function.zip"
echo "    Size: $(du -sh lambda_function.zip | cut -f1)"
echo ""

# ── 5. (Optional) Deploy via AWS CLI ────────────────────────────
# Uncomment and set FUNCTION_NAME + ACCOUNT_ID below to auto-deploy.

# FUNCTION_NAME="task-manager-api"
# ACCOUNT_ID="123456789012"
# REGION="ap-south-1"
# ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/task-manager-lambda-role"

# Check if function already exists
# if aws lambda get-function --function-name $FUNCTION_NAME --region $REGION > /dev/null 2>&1; then
#     echo "[5/5] Updating existing Lambda function..."
#     aws lambda update-function-code \
#         --function-name $FUNCTION_NAME \
#         --zip-file fileb://lambda_function.zip \
#         --region $REGION
# else
#     echo "[5/5] Creating new Lambda function..."
#     aws lambda create-function \
#         --function-name $FUNCTION_NAME \
#         --runtime python3.12 \
#         --handler handler.lambda_handler \
#         --zip-file fileb://lambda_function.zip \
#         --role $ROLE_ARN \
#         --timeout 30 \
#         --memory-size 256 \
#         --region $REGION \
#         --environment "Variables={
#             MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/,
#             DATABASE_NAME=intern_db,
#             SECRET_KEY=your-secret-key,
#             AWS_S3_BUCKET=task-manager-uploads-yourname,
#             AWS_S3_REGION=ap-south-1
#         }"
# fi

echo "--------------------------------------------"
echo " Next steps:"
echo "  1. Go to AWS Lambda Console"
echo "  2. Create function → Runtime: Python 3.12"
echo "  3. Handler: handler.lambda_handler"
echo "  4. Upload lambda_function.zip"
echo "  5. Set environment variables (see handler.py header)"
echo "  6. Attach IAM role with S3 access"
echo "--------------------------------------------"

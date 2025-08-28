# SonarCloud 設置指南

## 🎯 目標
將 SonarCloud 代碼品質分析集成到您的 GitHub Actions CI/CD 管道中。

## 📋 前置要求
- GitHub 帳戶
- 對倉庫的管理員權限
- 5-10 分鐘設置時間

## 🚀 快速設置步驟

### 步驟 1：創建 SonarCloud 帳戶

1. 前往 [SonarCloud](https://sonarcloud.io/)
2. 點擊 "Log in" 或 "Sign up"
3. 選擇 "Continue with GitHub" 登入
4. 授權 SonarCloud 訪問您的 GitHub 帳戶

### 步驟 2：創建組織

1. 登入後，點擊 "Create Organization"
2. 選擇免費方案（Free）
3. 輸入組織名稱（例如：`jasslin`）
4. 點擊 "Create Organization"

### 步驟 3：創建新項目

1. 點擊 "Create New Project"
2. 選擇 "GitHub" 作為代碼託管平台
3. 選擇您的 `webcpc-backend` 倉庫
4. 選擇免費方案（Free）
5. 點擊 "Create Project"

### 步驟 4：獲取 SonarCloud Token

1. 在 SonarCloud 中，點擊右上角頭像 → "My Account"
2. 點擊 "Security" 標籤
3. 在 "Generate Tokens" 部分：
   - 輸入名稱：`webcpc-backend-token`
   - 點擊 "Generate"
   - **複製並保存這個 token**（只顯示一次！）

### 步驟 5：配置 GitHub 倉庫 Secrets

1. 前往您的 GitHub 倉庫
2. 點擊 "Settings" → "Secrets and variables" → "Actions"
3. 點擊 "New repository secret"
4. 添加以下兩個 secrets：

```
SONAR_TOKEN = [您剛才獲取的 token]
SONAR_HOST_URL = https://sonarcloud.io
```

### 步驟 6：更新項目配置

1. 在 SonarCloud 項目頁面，複製以下信息：
   - **Organization Key**（例如：`jasslin`）
   - **Project Key**（例如：`jasslin_webcpc-backend`）

2. 更新 `sonar-project.properties` 文件：

```properties
# 將這些替換為實際值
sonar.projectKey=jasslin_webcpc-backend
sonar.organization=jasslin
```

### 步驟 7：啟用 SonarCloud 掃描

1. 編輯 `.github/workflows/quality-gate.yml`
2. 找到 `sonarcloud-scan` 作業
3. 將 `if: false` 改為 `if: true`

## 🔧 故障排除

### 常見錯誤

#### 1. "Failed to query server version"
- **原因**：缺少 SONAR_TOKEN 或 SONAR_HOST_URL
- **解決**：檢查 GitHub Secrets 是否正確配置

#### 2. "Project not found"
- **原因**：sonar-project.properties 中的密鑰不正確
- **解決**：更新配置文件中的實際值

#### 3. "No coverage data found"
- **原因**：測試覆蓋率報告路徑不正確
- **解決**：確保 `npm run test:coverage` 成功運行

### 檢查清單

- [ ] SonarCloud 帳戶已創建
- [ ] 組織和項目已創建
- [ ] Token 已生成並保存
- [ ] GitHub Secrets 已配置
- [ ] sonar-project.properties 已更新
- [ ] CI/CD 管道已啟用

## 📊 設置完成後

### 啟用 SonarCloud 掃描

```yaml
# 在 .github/workflows/quality-gate.yml 中
sonarcloud-scan:
  if: true  # 改為 true 啟用掃描
```

### 檢查結果

1. **GitHub Actions**：查看 SonarCloud 掃描結果
2. **SonarCloud**：查看代碼品質報告
3. **品質門禁**：確認代碼品質檢查通過

## 🎉 完成！

設置完成後，您的 CI/CD 管道將：
- 自動運行代碼品質分析
- 檢查測試覆蓋率
- 執行品質門禁檢查
- 提供詳細的代碼品質報告

## 📞 需要幫助？

如果遇到問題：
1. 檢查 GitHub Actions 日誌
2. 確認 SonarCloud 配置
3. 驗證 GitHub Secrets 設置

---

**注意**：SonarCloud 免費方案每月有 250,000 行代碼限制，對於大多數項目來說已經足夠。

# Mobile Conversion Plan: React Native for iOS & Android

## Project Goal
To convert the existing React web application ("My Wealth Management") into a fully functional, production-ready mobile application for both iOS and Android platforms, leveraging React Native. The mobile app will integrate with real external APIs to provide live financial data for all features, maintaining UI compatibility with the TerraVest design system.

## Strategy: React Native
**Choice Justification:**
*   **Code Reusability:** Significant portions of existing React logic (API calls, utility functions, state management, business logic) can be reused.
*   **Native Performance & Feel:** React Native compiles to native UI components, ensuring a true native user experience.
*   **Single Codebase:** Develop once, deploy to both iOS and Android, reducing development time and maintenance overhead.
*   **Leverages Existing Skills:** Utilizes existing JavaScript/TypeScript and React expertise.
*   **Rich Ecosystem:** Strong community support, vast libraries, and tooling.

## API Provider Research & Selection

### 1. Account Aggregation (Banks, Credit Cards, Investments)
*   **Provider:** **Plaid**
*   **Justification:** Industry leader, broad financial institution coverage, robust security, excellent developer tools (Node.js SDK, React Native SDK, Link UI), and comprehensive API products (Auth, Transactions, Balances, Investments).
*   **Key Products:** Plaid Link (UI for connecting accounts), Auth (account/routing numbers), Transactions (historical/real-time), Balances (real-time), Investments (holdings).
*   **Authentication:** OAuth-based flow via Plaid Link. Access tokens are exchanged and stored securely on the backend.
*   **Data Model:** Plaid's data model is well-defined and can be mapped to our Prisma schema.
*   **Webhooks:** Essential for real-time data updates (transactions, balances, item status).

### 2. Real Estate Data
*   **Provider:** **Zillow API (Zestimate API)**
*   **Justification:** Widely recognized for property valuations (Zestimates), broad coverage in the US. Requires API key and adherence to usage policies.
*   **Alternative:** ATTOM Data Solutions, CoreLogic (often commercial-grade, higher cost/complexity).
*   **Authentication:** API Key.
*   **Data Model:** Property details, valuation, historical data.

### 3. Business Data (Accounting & Financials)
*   **Provider:** **QuickBooks Online API**
*   **Justification:** Leading small business accounting software. Provides access to company financials (P&L, balance sheet, invoices, bills).
*   **Alternative:** Xero API, Stripe API (for revenue/transaction data if business is e-commerce focused).
*   **Authentication:** OAuth 2.0.
*   **Data Model:** Company, customer, vendor, invoice, bill, payment, P&L reports.

### 4. AI/ML Services (for AI Assistant)
*   **Provider:** **OpenAI API (GPT-4 or similar)**
*   **Justification:** Powerful large language models capable of generating human-like text, suitable for financial insights and recommendations based on structured data input.
*   **Alternative:** Google Cloud AI, AWS SageMaker (more for custom ML models).
*   **Authentication:** API Key.
*   **Data Model:** Input (user financial data summary), Output (structured text suggestions).

### 5. Payment Processing (for Bill Pay)
*   **Provider:** **Stripe Payments API**
*   **Justification:** Robust, secure, and widely used payment gateway. Supports various payment methods and can facilitate transfers.
*   **Alternative:** Plaid Transfer (for ACH payments), Dwolla.
*   **Authentication:** API Key.
*   **Data Model:** Payment intents, charges, transfers.

---

## Phases & Timelines

**Estimated Total Time:** 10-14 Weeks (assuming dedicated development, excluding extensive QA/deployment cycles)

---

### **Phase 0: Project Setup & Core Structure (1-2 Weeks)**

**Goal:** Initialize the React Native project, integrate the TerraVest design system, set up navigation, and ensure basic API connectivity.

**Granular Steps:**

1.  **React Native Project Initialization:**
    *   [ ] Create new Expo project: `npx create-expo-app my-wealth-management-mobile`
    *   [ ] Navigate into project: `cd my-wealth-management-mobile`
    *   [ ] Install core dependencies: `npm install react-native-safe-area-context @react-navigation/native @react-navigation/stack @react-navigation/bottom-tabs`
    *   [ ] Install `react-native-svg` for SVG rendering.
    *   [ ] Install `expo-font` for custom font loading.
    *   [ ] Install `axios` or ensure `fetch` is used consistently for API calls.
    *   [ ] Configure `babel.config.js` for alias resolution if used in web project.

2.  **Design System Integration:**
    *   [ ] Create `src/styles/theme.js` (or similar) to define `Colors`, `Spacing`, `Typography` constants based on `terravest-theme.css`.
    *   [ ] Convert all CSS variables (colors, spacing, font sizes, border radii, shadows) into JavaScript constants.
    *   [ ] Load custom fonts (`DM Sans`, `DM Serif Display`) using `expo-font` in your root `App.js`/`App.tsx`.
    *   [ ] Create a base `StyleSheet` utility for common styles.

3.  **Navigation Setup (React Navigation):**
    *   [ ] Define a `RootNavigator` (Stack Navigator) for overall app flow (e.g., Auth Stack, Main App Stack).
    *   [ ] Implement a `BottomTabNavigator` for main app screens (Home, Accounts, etc.) to replace the web sidebar.
    *   [ ] Map all existing web routes to corresponding React Native screens.
    *   [ ] Implement authentication flow: if not authenticated, navigate to Auth Stack; otherwise, to Main App Stack.

4.  **Backend API Integration:**
    *   [ ] Adapt `apps/web/src/api.js` into a reusable `shared/api.js` (or similar) that can be imported by the React Native project.
    *   [ ] Ensure API calls are generic enough or create a new `api.js` for React Native that uses `fetch` or `axios`.
    *   [ ] Verify all API calls from the mobile app correctly hit your existing backend.

---

### **Phase 1: Core Account Aggregation (Plaid) (2-3 Weeks)**

**Goal:** Enable users to securely link their bank and credit card accounts via Plaid, fetch real-time balances, and retrieve transaction history.

**Granular Steps:**

1.  **Backend (`apps/api`) - Plaid Integration:**
    *   [ ] **Install Plaid Node.js Client Library:** `npm install plaid` in `finance-mvp/apps/api`.
    *   [ ] **Configure Plaid Client:**
        *   [ ] Add `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV` to `apps/api/.env`.
        *   [ ] Create `apps/api/src/plaid.js` to initialize the Plaid client.
    *   [ ] **Update Prisma Schema (`prisma/schema.prisma`):**
        *   [ ] Add `PlaidItem` model to store `accessToken`, `itemId`, `institutionId`, linked to `User`.
        *   [ ] Add `plaidAccountId` and `plaidItemId` to the `Account` model.
        *   [ ] Add `plaidTransactionId` and `plaidAccountId` to the `Transaction` model.
        *   [ ] Run `npx prisma db push` and `npx prisma generate` in `finance-mvp/apps/api`.
    *   [ ] **Create `POST /v1/aggregation/create-link-token` Endpoint (`apps/api/src/server.js`):**
        *   [ ] Implement endpoint to call `plaidClient.linkTokenCreate()`.
        *   [ ] Pass `req.user.id` for `client_user_id`.
        *   [ ] Specify `products: ['transactions', 'auth', 'balances']`.
        *   [ ] Define a `webhook` URL (e.g., `process.env.PLAID_WEBHOOK_URL`).
        *   [ ] Return `link_token` in response.
    *   [ ] **Create `POST /v1/aggregation/exchange-public-token` Endpoint (`apps/api/src/server.js`):**
        *   [ ] Implement endpoint to receive `public_token`.
        *   [ ] Call `plaidClient.itemPublicTokenExchange()`.
        *   [ ] Store `access_token`, `item_id`, `institution_id` in `PlaidItem` model for the user.
        *   [ ] Return success response.
    *   [ ] **Update `GET /v1/accounts` Endpoint (`apps/api/src/server.js`):**
        *   [ ] Modify existing endpoint to fetch accounts from Plaid for linked `PlaidItem`s.
        *   [ ] Process Plaid `accountsGet` response and map to your `Account` model.
        *   [ ] Create/update `Account` records in your database with `plaidAccountId` and `plaidItemId`.
        *   [ ] Ensure existing manually added accounts are still handled (if any).
    *   [ ] **Update `GET /v1/transactions` Endpoint (`apps/api/src/server.js`):**
        *   [ ] Modify existing endpoint to fetch transactions from Plaid for linked `PlaidItem`s.
        *   [ ] Call `plaidClient.transactionsGet()` for each `PlaidItem` (e.g., for the last 90 days).
        *   [ ] Process Plaid `transactionsGet` response and map to your `Transaction` model.
        *   [ ] Create/update `Transaction` records in your database with `plaidTransactionId` and `plaidAccountId`.
        *   [ ] Ensure existing manually added transactions are still handled (if any).
    *   [ ] **Update Frontend `api.js` (`shared/api.js` or `apps/mobile/src/api.js`):**
        *   [ ] Add `createLinkToken()` function to call backend `/v1/aggregation/create-link-token`.
        *   [ ] Add `exchangePublicToken(publicToken)` function to call backend `/v1/aggregation/exchange-public-token`.
        *   [ ] Update `getAccounts()` and `getTransactions()` to call the modified backend endpoints.

2.  **Frontend (`apps/mobile`) - Plaid Link UI & Data Display:**
    *   [ ] **Install `react-plaid-link` Library:** `npm install react-plaid-link` in `finance-mvp/apps/mobile`.
    *   [ ] **Create `PlaidLinkButton.jsx` Component (`apps/mobile/src/components/PlaidLinkButton.jsx`):**
        *   [ ] Create the component using `usePlaidLink` hook.
        *   [ ] Implement `onClick` to call `api.createLinkToken()` and open Plaid Link.
        *   [ ] Implement `onSuccess` callback to call `api.exchangePublicToken()` and then trigger a data refresh (e.g., `props.onSuccess`).
        *   [ ] Implement `onExit` callback for error/cancellation handling.
    *   [ ] **Convert `AccountsPage.jsx`:**
        *   [ ] Recreate the UI using React Native components (`View`, `Text`, `FlatList`, `Button`).
        *   [ ] Integrate `PlaidLinkButton` to replace the existing "Link Account" button.
        *   [ ] Ensure the page uses the `accounts` prop (now containing real Plaid data).
        *   [ ] Adjust display logic for new data structure (e.g., showing institution names).
    *   [ ] **Convert `TransactionsPage.jsx`:**
        *   [ ] Recreate the UI using React Native components.
        *   [ ] Ensure the page uses the `transactions` prop (now containing real Plaid data).
        *   [ ] Adjust display logic for new data structure (e.g., showing transaction categories).
    *   [ ] **Convert `HomePage.jsx`:**
        *   [ ] Recreate the UI using React Native components.
        *   [ ] Verify that "Cash" and "Debt" KPIs correctly reflect real data from `snapshot.components`.
        *   [ ] Ensure `totalUtil` calculation uses real credit card data.
        *   [ ] Update "Upcoming Bills" to use real `paymentIntents` (which might be linked to real credit cards).
    *   [ ] **Implement Loading States and Error Handling:**
        *   [ ] Add loading indicators (`ActivityIndicator`) when fetching data from Plaid via your backend.
        *   [ ] Display user-friendly error messages for failed API calls.

3.  **Data Synchronization & Webhooks (Plaid):**
    *   [ ] **Configure Plaid Webhooks:**
        *   [ ] In Plaid Dashboard, set up a webhook URL pointing to your deployed backend or an `ngrok` tunnel for local development.
        *   [ ] Add `PLAID_WEBHOOK_URL` to `apps/api/.env`.
    *   [ ] **Create Plaid Webhook Receiver Endpoint (`apps/api/src/server.js`):**
        *   [ ] Create `POST /v1/plaid/webhook` endpoint.
        *   [ ] Implement webhook signature verification using `plaidClient.webhookVerificationKeyGet()`.
        *   [ ] Handle `TRANSACTIONS_UPDATES` webhook: Fetch new transactions for the affected `item_id` and update `Transaction` records.
        *   [ ] Handle `BALANCES_UPDATES` webhook: Fetch updated balances for the affected `item_id` and update `Account` records.
        *   [ ] Handle `ITEM_ERROR` webhook: Mark the `PlaidItem` as errored and notify the user.
    *   [ ] **Implement Incremental Data Updates:** Ensure transaction fetching logic (initial and webhook-triggered) handles incremental updates to avoid duplicates and keep data fresh.

---

### **Phase 2: Expand Aggregation (Investments & Real Estate) (2-3 Weeks)**

**Goal:** Integrate real investment holdings (via Plaid Investments) and real estate valuations (via Zillow API).

**Granular Steps:**

1.  **Backend (`apps/api`) - Investment & Real Estate API Integration:**
    *   [ ] **Plaid Investments Integration:**
        *   [ ] Ensure `transactions` product in `linkTokenCreate` includes `investments`.
        *   [ ] Update Prisma schema to include `InvestmentAccount` and `Holding` models.
        *   [ ] Create `GET /v1/investments` endpoint to call `plaidClient.investmentsHoldingsGet()` for linked `PlaidItem`s.
        *   [ ] Process holdings data and store in your database.
    *   [ ] **Zillow API Integration:**
        *   [ ] Sign up for Zillow API key.
        *   [ ] Add `ZILLOW_API_KEY` to `apps/api/.env`.
        *   [ ] Create `GET /v1/real-estate/:id/valuation` endpoint to call Zillow API with property address.
        *   [ ] Update `RealEstate` Prisma model to store Zillow-specific IDs and valuation data.
        *   [ ] Create `POST /v1/real-estate/add-property` endpoint to take address, call Zillow, and save property.

2.  **Frontend (`apps/mobile`) - Investment & Real Estate UI:**
    *   [ ] **Convert `InvestPage.jsx`:**
        *   [ ] Recreate UI using React Native components.
        *   [ ] Display real investment account balances and holdings fetched from `/v1/investments`.
        *   [ ] Implement a "Link Broker" flow (using Plaid Link with `investments` product).
    *   [ ] **Convert `RealEstatePage.jsx`:**
        *   [ ] Recreate UI using React Native components.
        *   [ ] Modify "Add Property" button to allow users to input an address, triggering backend call to Zillow.
        *   [ ] Display real total value, equity, and mortgage for properties fetched from `/v1/real-estate`.
    *   [ ] **Update `HomePage.jsx` KPIs:**
        *   [ ] Ensure investment and real estate KPIs reflect real data.

---

### **Phase 3: Business Data & AI Assistant Integration (2-3 Weeks)**

**Goal:** Power "My Business" and "AI Assistant" with real, aggregated data and external AI services.

**Granular Steps:**

1.  **Backend (`apps/api`) - Business Data & OpenAI Integration:**
    *   [ ] **QuickBooks Online API Integration:**
        *   [ ] Register your app with QuickBooks Developer.
        *   [ ] Add QuickBooks credentials (`QB_CLIENT_ID`, `QB_CLIENT_SECRET`, `QB_REDIRECT_URI`) to `apps/api/.env`.
        *   [ ] Implement OAuth 2.0 flow for connecting QuickBooks accounts.
        *   [ ] Create `POST /v1/business/link-accounting` endpoint to handle OAuth callback and store tokens.
        *   [ ] Create `GET /v1/my-business/dashboard` endpoint to fetch real P&L, balance sheet, and loan data from QuickBooks.
        *   [ ] Update Prisma schema for `BusinessAccount` and related models.
    *   [ ] **OpenAI API Integration:**
        *   [ ] Sign up for OpenAI API key.
        *   [ ] Add `OPENAI_API_KEY` to `apps/api/.env`.
        *   [ ] Create `POST /v1/ai-assistant/suggestions` endpoint:
            *   [ ] Gather all available real user data (personal accounts, investments, real estate, business data) based on frontend toggles.
            *   [ ] Construct a detailed prompt for the OpenAI API.
            *   [ ] Call OpenAI API (`openai.chat.completions.create`).
            *   [ ] Parse and structure the AI's response into categorized suggestions.
            *   [ ] Implement caching for AI responses.

2.  **Frontend (`apps/mobile`) - Business & AI Assistant UI:**
    *   [ ] **Convert `MyBusinessPage.jsx`:**
        *   [ ] Recreate UI using React Native components.
        *   [ ] Update to fetch data from the new `/v1/my-business/dashboard` endpoint.
        *   [ ] Display real business KPIs, loan breakdowns, and profit/loss summaries.
        *   [ ] Implement a "Link Business Account" flow (OAuth redirect to backend).
    *   [ ] **Convert `AIAssistantPage.jsx`:**
        *   [ ] Recreate UI using React Native components.
        *   [ ] Modify "Generate Suggestions" button to call the backend's `/v1/ai-assistant/suggestions` endpoint.
        *   [ ] Pass user's input parameters (monthly income/expenses, goals, data inclusion toggles) to the backend.
        *   [ ] Display the real AI-generated suggestions dynamically.
        *   [ ] Ensure loading animations (`ActivityIndicator`) and error states are handled correctly.
        *   [ ] Maintain the disclaimer card.

---

### **Phase 4: Bill Pay Integration & General Enhancements (2-3 Weeks)**

**Goal:** Implement real bill payment functionality and polish the application for production readiness.

**Granular Steps:**

1.  **Backend (`apps/api`) - Stripe Integration:**
    *   [ ] **Stripe Payments API Integration:**
        *   [ ] Sign up for Stripe account and get API keys.
        *   [ ] Add `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` to `apps/api/.env`.
        *   [ ] Modify `POST /v1/payments/bill-pay-intents` endpoint:
            *   [ ] Create a Stripe Payment Intent.
            *   [ ] Handle payment confirmation (e.g., using webhooks or client-side confirmation).
            *   [ ] Update `PaymentIntent` Prisma model with Stripe-specific IDs and status.
        *   [ ] Implement Stripe webhooks for asynchronous payment status updates.

2.  **Frontend (`apps/mobile`) - Bill Pay & Polish:**
    *   [ ] **Convert `BillPayPage.jsx`:**
        *   [ ] Recreate UI using React Native components.
        *   [ ] Integrate Stripe React Native SDK (if applicable for client-side payment confirmation).
        *   [ ] Ensure "Confirm Payment" button triggers the real payment flow via the backend.
        *   [ ] Display real-time payment status updates.
    *   [ ] **Convert Remaining Placeholder Pages:**
        *   [ ] `CashPage.jsx`, `ProfilePage.jsx`, `LearnPage.jsx`, `FractionalLLCPage.jsx`, `SecurityPage.jsx`, `MessagesPage.jsx`, `SettingsPage.jsx`.
        *   [ ] Recreate their UIs using React Native components, integrating any relevant real data.
    *   [ ] **General UI/UX Polish:**
        *   [ ] Review all screens for consistent spacing, typography, and component usage according to the TerraVest design system.
        *   [ ] Optimize animations and transitions for a smooth native feel.
        *   [ ] Implement haptic feedback where appropriate.
    *   [ ] **Error Handling & User Feedback:**
        *   [ ] Implement a consistent notification system (e.g., `react-native-flash-message`) for success, warning, and error messages.
        *   [ ] Ensure all API calls have proper loading states and error displays.
    *   [ ] **Performance Optimization:**
        *   [ ] Profile and optimize app performance on various devices.
        *   [ ] Implement lazy loading for components/data where beneficial.

---

### **Phase 5: Testing, QA & Deployment (2-3 Weeks)**

**Goal:** Ensure the application is stable, performs well, and is ready for release on app stores.

**Granular Steps:**

1.  **Comprehensive Testing:**
    *   [ ] **Unit Tests:** Implement unit tests for all new React Native components and backend API logic.
    *   [ ] **Integration Tests:** Test the full flow from frontend to backend to external APIs.
    *   [ ] **End-to-End (E2E) Tests:** Use tools like Detox or Appium for automated E2E testing on emulators/devices.
    *   [ ] **Manual QA:** Thorough manual testing on a wide range of physical iOS and Android devices (different screen sizes, OS versions).
    *   [ ] **User Acceptance Testing (UAT):** Involve end-users for feedback and bug discovery.
2.  **Performance & Stability:**
    *   [ ] Monitor app performance (startup time, responsiveness, memory usage).
    *   [ ] Identify and fix memory leaks or performance bottlenecks.
    *   [ ] Implement crash reporting (e.g., Sentry, Firebase Crashlytics).
3.  **Security Audit:**
    *   [ ] Review API key handling, data storage, and communication for security vulnerabilities.
    *   [ ] Ensure compliance with data privacy regulations (e.g., GDPR, CCPA).
4.  **Deployment Preparation:**
    *   [ ] Configure app icons, splash screens, and other platform-specific assets.
    *   [ ] Set up push notifications (e.g., Expo Notifications, Firebase Cloud Messaging).
    *   [ ] Prepare app store listings (screenshots, descriptions, privacy policy).
    *   [ ] Generate production builds for iOS and Android.
    *   [ ] Submit to Apple App Store and Google Play Store.
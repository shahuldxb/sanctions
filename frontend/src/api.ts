import axios from 'axios'

export const api = axios.create({ baseURL: '/api', timeout: 90000 })
const scraperApi = axios.create({ baseURL: '/scraper', timeout: 300000 })

api.interceptors.response.use(r => r, err => {
  console.error('API Error:', err.response?.data || err.message)
  return Promise.reject(err.response?.data || err)
})

// ── Dashboard ──────────────────────────────────────────────────────────────
export const getDashboard = () => api.get('/dashboard/summary')
export const getDashboardSummary = () => api.get('/dashboard/summary')
export const getDashboardTrends = () => api.get('/dashboard/trends')
export const getDashboardRisk = () => api.get('/dashboard/risk-distribution')

// ── Sanctions Lists ────────────────────────────────────────────────────────
export const getSanctions = (p?: any) => api.get('/sanctions', { params: p })
export const getSanctionStats = () => api.get('/sanctions/stats')
export const getSanctionEntry = (id: number) => api.get(`/sanctions/${id}`)
export const createSanctionEntry = (d: any) => api.post('/sanctions', d)
export const updateSanctionEntry = (id: number, d: any) => api.put(`/sanctions/${id}`, d)
export const deleteSanctionEntry = (id: number) => api.delete(`/sanctions/${id}`)

// ── Screening ──────────────────────────────────────────────────────────────
export const screenSubject = (d: any) => api.post('/screening/screen', d)
export const screenPEP = (d: any) => api.post('/pep/screen', d)
export const getScreeningRequests = (p?: any) => api.get('/screening/history', { params: p })
export const getScreeningRequest = (id: number) => api.get(`/screening/${id}`)
export const getScreeningMatches = (reqId: number) => api.get(`/screening/${reqId}/matches`)
export const updateMatch = (id: number, d: any) => api.put(`/screening/matches/${id}`, d)
export const runFuzzyMatch = (d: any) => api.post('/screening/fuzzy-test', d)
export const getFuzzyStats = () => api.get('/screening/stats')

// ── Cases ──────────────────────────────────────────────────────────────────
export const getCases = (p?: any) => api.get('/cases', { params: p })
export const getCase = (id: number) => api.get(`/cases/${id}`)
export const createCase = (d: any) => api.post('/cases', d)
export const updateCase = (id: number, d: any) => api.put(`/cases/${id}`, d)
export const deleteCase = (id: number) => api.delete(`/cases/${id}`)
export const addCaseNote = (id: number, d: any) => api.post(`/cases/${id}/notes`, d)

// ── Customers ─────────────────────────────────────────────────────────────
export const getCustomers = (p?: any) => api.get('/customers', { params: p })
export const getCustomer = (id: number) => api.get(`/customers/${id}`)
export const createCustomer = (d: any) => api.post('/customers', d)
export const updateCustomer = (id: number, d: any) => api.put(`/customers/${id}`, d)
export const deleteCustomer = (id: number) => api.delete(`/customers/${id}`)

// ── Accounts ──────────────────────────────────────────────────────────────
export const getAccounts = (p?: any) => api.get('/accounts', { params: p })
export const getAccount = (id: number) => api.get(`/accounts/${id}`)
export const createAccount = (d: any) => api.post('/accounts', d)
export const updateAccount = (id: number, d: any) => api.put(`/accounts/${id}`, d)
export const deleteAccount = (id: number) => api.delete(`/accounts/${id}`)

// ── Assets ────────────────────────────────────────────────────────────────
export const getAssets = (p?: any) => api.get('/assets', { params: p })
export const getAsset = (id: number) => api.get(`/assets/${id}`)
export const createAsset = (d: any) => api.post('/assets', d)
export const updateAsset = (id: number, d: any) => api.put(`/assets/${id}`, d)
export const deleteAsset = (id: number) => api.delete(`/assets/${id}`)

// ── Liabilities ───────────────────────────────────────────────────────────
export const getLiabilities = (p?: any) => api.get('/liabilities', { params: p })
export const getLiability = (id: number) => api.get(`/liabilities/${id}`)
export const createLiability = (d: any) => api.post('/liabilities', d)
export const updateLiability = (id: number, d: any) => api.put(`/liabilities/${id}`, d)
export const deleteLiability = (id: number) => api.delete(`/liabilities/${id}`)

// ── Transactions ──────────────────────────────────────────────────────────
export const getTransactions = (p?: any) => api.get('/transactions', { params: p })
export const getTransaction = (id: number) => api.get(`/transactions/${id}`)
export const createTransaction = (d: any) => api.post('/transactions', d)
export const updateTransaction = (id: number, d: any) => api.put(`/transactions/${id}`, d)
export const deleteTransaction = (id: number) => api.delete(`/transactions/${id}`)

// ── Vessels ───────────────────────────────────────────────────────────────
export const getVessels = (p?: any) => api.get('/vessels', { params: p })
export const getVessel = (id: number) => api.get(`/vessels/${id}`)
export const createVessel = (d: any) => api.post('/vessels', d)
export const updateVessel = (id: number, d: any) => api.put(`/vessels/${id}`, d)
export const deleteVessel = (id: number) => api.delete(`/vessels/${id}`)

// ── Countries ─────────────────────────────────────────────────────────────
export const getCountries = (p?: any) => api.get('/countries', { params: p })
export const getCountry = (id: number) => api.get(`/countries/${id}`)
export const createCountry = (d: any) => api.post('/countries', d)
export const updateCountry = (id: number, d: any) => api.put(`/countries/${id}`, d)
export const deleteCountry = (id: number) => api.delete(`/countries/${id}`)

// ── Watchlist ─────────────────────────────────────────────────────────────
export const getWatchlist = (p?: any) => api.get('/watchlist', { params: p })
export const getWatchlistEntry = (id: number) => api.get(`/watchlist/${id}`)
export const createWatchlistEntry = (d: any) => api.post('/watchlist', d)
export const updateWatchlistEntry = (id: number, d: any) => api.put(`/watchlist/${id}`, d)
export const deleteWatchlistEntry = (id: number) => api.delete(`/watchlist/${id}`)

// ── Alerts ────────────────────────────────────────────────────────────────
export const getAlerts = (p?: any) => api.get('/alerts', { params: p })
export const getAlert = (id: number) => api.get(`/alerts/${id}`)
export const createAlert = (d: any) => api.post('/alerts', d)
export const updateAlert = (id: number, d: any) => api.put(`/alerts/${id}`, d)
export const deleteAlert = (id: number) => api.delete(`/alerts/${id}`)
export const getAlertStats = () => api.get('/alerts/stats/summary')

// ── Reports ───────────────────────────────────────────────────────────────
export const getReports = () => api.get('/reports')
export const generateReport = (d: any) => api.post('/reports/generate', d)
export const updateReport = (id: number, d: any) => api.put(`/reports/${id}`, d)
export const deleteReport = (id: number) => api.delete(`/reports/${id}`)

// ── Audit ─────────────────────────────────────────────────────────────────
export const getAuditLog = (p?: any) => api.get('/audit', { params: p })
export const getAuditLogs = (p?: any) => api.get('/audit', { params: p })

// ── Rules ─────────────────────────────────────────────────────────────────
export const getRules = (p?: any) => api.get('/rules', { params: p })
export const getRule = (id: number) => api.get(`/rules/${id}`)
export const createRule = (d: any) => api.post('/rules', d)
export const updateRule = (id: number, d: any) => api.put(`/rules/${id}`, d)
export const deleteRule = (id: number) => api.delete(`/rules/${id}`)

// ── Users ─────────────────────────────────────────────────────────────────
export const getUsers = (p?: any) => api.get('/users', { params: p })
export const getUser = (id: number) => api.get(`/users/${id}`)
export const createUser = (d: any) => api.post('/users', d)
export const updateUser = (id: number, d: any) => api.put(`/users/${id}`, d)
export const deleteUser = (id: number) => api.delete(`/users/${id}`)

// ── Trade Finance ─────────────────────────────────────────────────────────
export const getTradeFinance = (p?: any) => api.get('/trade-finance', { params: p })
export const getTradeFinanceItem = (id: number) => api.get(`/trade-finance/${id}`)
export const createTradeFinance = (d: any) => api.post('/trade-finance', d)
export const updateTradeFinance = (id: number, d: any) => api.put(`/trade-finance/${id}`, d)
export const deleteTradeFinance = (id: number) => api.delete(`/trade-finance/${id}`)
export const screenTradeFinance = (id: number) => api.post(`/trade-finance/${id}/screen`, {})

// ── AI ────────────────────────────────────────────────────────────────────
export const aiAnalyze = (d: any) => api.post('/ai/analyze', d)
export const aiChat = (d: any) => api.post('/ai/chat', d)
export const aiNarrative = (d: any) => api.post('/ai/generate-narrative', d)
export const aiTransliterate = (d: any) => api.post('/ai/transliterate', d)
export const aiRiskAssessment = (d: any) => api.post('/ai/risk-assessment', d)
export const getAISessions = (p?: any) => api.get('/ai/sessions', { params: p })
export const getAISessionMessages = (id: number) => api.get(`/ai/sessions/${id}/messages`)
export const deleteAISession = (id: number) => api.delete(`/ai/sessions/${id}`)
export const submitAIFeedback = (msgId: number, score: number, note?: string) => api.patch(`/ai/messages/${msgId}/feedback`, { score, note })

// ── Scraper ───────────────────────────────────────────────────────────────
export const getScraperStatus = () => api.get('/scraper/status')
export const getScraperHistory = () => api.get('/scraper/history')
export const getScheduler = () => api.get('/scraper/scheduler')
export const getSchedulerJobs = () => api.get('/scraper/scheduler')
export const updateScheduler = (id: number, d: any) => api.put(`/scraper/scheduler/${id}`, d)
export const updateSchedulerJob = (id: string, d: any) => api.put(`/scraper/scheduler/${id}`, d)
export const triggerScrape = (code: string) => api.post(`/scraper/trigger/${code}`)
export const triggerAllScrapes = () => api.post('/scraper/trigger-all')
export const runScraper = (d: any) => api.post(`/scraper/trigger/${d.source_code}`, d)
export const stopScraper = (code: string) => api.post(`/scraper/stop/${code}`)
export const getActiveRuns = () => api.get('/scraper/active-runs')
export const runSchedulerJob = (id: string) => api.post(`/scraper/scheduler/${id}/run`)
export const getOFACDelta = () => api.get('/scraper/ofac-delta/history')
export const runOFACDelta = () => api.post('/scraper/trigger/OFAC')
export const getEnrichmentStatus = () => api.get('/scraper/enrichment/stats')
export const runEnrichment = (d?: any) => api.post('/scraper/run/enrichment', d)

// ── Scraper Service (direct) ──────────────────────────────────────────────
export const scraperTrigger = (code: string, mode = 'full') => scraperApi.post(`/scrape/${code}`, { mode })
export const scraperTriggerAll = (mode = 'full') => scraperApi.post('/scrape-all', { mode })
export const scraperOFACDelta = () => scraperApi.post('/ofac-delta')
export const scraperActiveRuns = () => scraperApi.get('/active-runs')
export const scraperRunLog = (runId: string) => scraperApi.get(`/run-log/${runId}`)

export default api

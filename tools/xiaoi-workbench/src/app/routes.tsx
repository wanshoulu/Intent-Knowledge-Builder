import { Navigate, Route, Routes } from 'react-router-dom';
import { WorkbenchLayout } from '../layout/WorkbenchLayout';
import { DashboardPage } from '../pages/DashboardPage';
import { KnowledgeItemsPage } from '../pages/KnowledgeItemsPage';
import { LanguageRulesPage } from '../pages/LanguageRulesPage';
import { ConceptsPage } from '../pages/ConceptsPage';
import { GovernancePage } from '../pages/GovernancePage';
import { InteractionsPage } from '../pages/InteractionsPage';
import { QualityPage } from '../pages/QualityPage';
import { SettingsPage } from '../pages/SettingsPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<WorkbenchLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/knowledge-items" element={<KnowledgeItemsPage />} />
        <Route path="/knowledge-items/:id" element={<KnowledgeItemsPage />} />
        <Route path="/language" element={<LanguageRulesPage />} />
        <Route path="/concepts" element={<ConceptsPage />} />
        <Route path="/interactions" element={<InteractionsPage />} />
        <Route path="/governance" element={<GovernancePage />} />
        <Route path="/quality" element={<QualityPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

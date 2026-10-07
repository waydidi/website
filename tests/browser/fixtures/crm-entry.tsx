import { createRoot } from 'react-dom/client';
import { AdminAffiliates } from '../../../components/admin-affiliates/affiliates';
import { CrmWorkspace } from '../../../components/crm/workspace';
createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).has('affiliates') ? <AdminAffiliates/> : <CrmWorkspace me={{id:'owner',role:'owner'}}/>);

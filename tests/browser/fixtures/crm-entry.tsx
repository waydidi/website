import { createRoot } from 'react-dom/client';
import { CrmWorkspace } from '../../../components/crm/workspace';
createRoot(document.getElementById('root')!).render(<CrmWorkspace me={{id:'owner',role:'owner'}}/>);

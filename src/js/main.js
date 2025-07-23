 // Importações do Firebase
        import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
        import { 
            getAuth, 
            createUserWithEmailAndPassword, 
            signInWithEmailAndPassword, 
            signOut, 
            onAuthStateChanged,
            updateProfile
        } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
        import { 
            getFirestore, 
            collection, 
            addDoc, 
            getDocs, 
            doc, 
            getDoc,
            deleteDoc,
            onSnapshot,
            query,
            where,
            Timestamp
        } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
        import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";
        import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js";

        // --- Configuração do Firebase ---
        const firebaseConfig = typeof __firebase_config !== 'undefined' 
            ? JSON.parse(__firebase_config)
            : { 
                apiKey: "AIzaSyC8LkY1_voo2AFX0NImfkZjdc1Zrcjn2S8", 
                authDomain: "logossystemcoleta.firebaseapp.com", 
                projectId: "logossystemcoleta",
                storageBucket: "logossystemcoleta.appspot.com", 
                messagingSenderId: "681461082199", 
                appId: "1:681461082199:web:0d9012ac945f4d951a9b12" 
            };

        const appId = typeof __app_id !== 'undefined' ? __app_id : 'patriscan-mvp';

        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        const db = getFirestore(app);
        const storage = getStorage(app);
        const analytics = getAnalytics(app);

        // --- Referências de Elementos do DOM ---
        const appRoot = document.getElementById('app-root');
        const publicViewPage = document.getElementById('public-view-page');
        const authScreen = document.getElementById('auth-screen');
        const mainContent = document.getElementById('main-content');
        const loadingSpinner = document.getElementById('loading-spinner');
        
        let currentUser = null;
        let bensUnsubscribe = null;
        let bensPorSetorChartInstance = null;
        let bensPorConservacaoChartInstance = null;
        let currentBens = []; // Variável para guardar os bens atuais

        // --- Lógica de Roteamento (Página Pública vs App Principal) ---
        window.addEventListener('DOMContentLoaded', () => {
            setupTheme(); // Configura o tema na carga inicial
            const params = new URLSearchParams(window.location.search);
            if (params.get('view') === 'public' && params.get('userId') && params.get('bemId')) {
                handlePublicView(params.get('userId'), params.get('bemId'));
            } else {
                setupMainApp();
            }
        });

        async function handlePublicView(userId, bemId) {
            appRoot.classList.add('hidden');
            publicViewPage.classList.remove('hidden');
            const publicBemCard = document.getElementById('public-bem-card');
            publicBemCard.innerHTML = `<div class="text-center"><p class="text-xl dark:text-white">A carregar dados do bem...</p></div>`;

            try {
                const docRef = doc(db, `artifacts/${appId}/users/${userId}/patrimonios`, bemId);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const bemData = docSnap.data();
                    publicBemCard.innerHTML = generateBemDetailHTML(bemData, false, true); // isPublic = true
                    new QRCode(document.getElementById("qrcode-view"), {
                        text: window.location.href,
                        width: 128,
                        height: 128,
                    });
                } else {
                    publicBemCard.innerHTML = `<div class="text-center bg-white dark:bg-gray-800 p-8 rounded-lg shadow-lg"><p class="text-xl text-red-600 font-bold">Erro</p><p class="dark:text-white">Ficha patrimonial não encontrada.</p></div>`;
                }
            } catch (error) {
                console.error("Erro ao carregar bem público:", error);
                publicBemCard.innerHTML = `<div class="text-center bg-white dark:bg-gray-800 p-8 rounded-lg shadow-lg"><p class="text-xl text-red-600 font-bold">Erro</p><p class="dark:text-white">Não foi possível carregar os dados. Tente novamente mais tarde.</p></div>`;
            }
        }

        function setupMainApp() {
            publicViewPage.classList.add('hidden');
            appRoot.classList.remove('hidden');
            onAuthStateChanged(auth, (user) => {
                if (user) {
                    currentUser = user;
                    authScreen.classList.add('hidden');
                    mainContent.classList.remove('hidden');
                    document.getElementById('user-email-display').textContent = user.displayName || user.email;
                    loadBens();
                } else {
                    currentUser = null;
                    if (bensUnsubscribe) bensUnsubscribe();
                    authScreen.classList.remove('hidden');
                    mainContent.classList.add('hidden');
                    resetUI();
                }
            });
        }
        
        // --- Lógica do Modo Escuro ---
        const themeToggleBtn = document.getElementById('theme-toggle');
        const darkIcon = document.getElementById('theme-toggle-dark-icon');
        const lightIcon = document.getElementById('theme-toggle-light-icon');

        function setupTheme() {
            if (localStorage.getItem('color-theme') === 'dark' || (!('color-theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                document.documentElement.classList.add('dark');
                lightIcon.classList.remove('hidden');
            } else {
                document.documentElement.classList.remove('dark');
                darkIcon.classList.remove('hidden');
            }
        }

        themeToggleBtn.addEventListener('click', () => {
            darkIcon.classList.toggle('hidden');
            lightIcon.classList.toggle('hidden');

            if (localStorage.getItem('color-theme')) {
                if (localStorage.getItem('color-theme') === 'light') {
                    document.documentElement.classList.add('dark');
                    localStorage.setItem('color-theme', 'dark');
                } else {
                    document.documentElement.classList.remove('dark');
                    localStorage.setItem('color-theme', 'light');
                }
            } else {
                if (document.documentElement.classList.contains('dark')) {
                    document.documentElement.classList.remove('dark');
                    localStorage.setItem('color-theme', 'light');
                } else {
                    document.documentElement.classList.add('dark');
                    localStorage.setItem('color-theme', 'dark');
                }
            }
            // BUG FIX: Atualiza os gráficos após mudar o tema
            updateDashboard(currentBens);
        });


        // --- Lógica de Autenticação ---
        const loginForm = document.getElementById('login-form');
        const registerForm = document.getElementById('register-form');
        const toggleAuthModeLink = document.getElementById('toggle-auth-mode');
        const authTitle = document.getElementById('auth-title');
        const authError = document.getElementById('auth-error');

        toggleAuthModeLink.addEventListener('click', (e) => {
            e.preventDefault();
            loginForm.classList.toggle('hidden');
            registerForm.classList.toggle('hidden');
            if (registerForm.classList.contains('hidden')) {
                authTitle.textContent = 'Acesse sua conta para continuar';
                toggleAuthModeLink.textContent = 'Não tem uma conta? Cadastre-se';
            } else {
                authTitle.textContent = 'Crie uma nova conta';
                toggleAuthModeLink.textContent = 'Já tem uma conta? Faça login';
            }
            authError.textContent = '';
        });

        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            showLoading(true);
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            try {
                await signInWithEmailAndPassword(auth, email, password);
                authError.textContent = '';
                logEvent(analytics, 'login', { method: 'Email' });
            } catch (error) {
                console.error("Erro no login:", error);
                authError.textContent = 'Email ou senha inválidos.';
            } finally {
                showLoading(false);
            }
        });

        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            showLoading(true);
            const name = document.getElementById('register-name').value;
            const email = document.getElementById('register-email').value;
            const password = document.getElementById('register-password').value;
            try {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                await updateProfile(userCredential.user, { displayName: name });
                authError.textContent = '';
                logEvent(analytics, 'sign_up', { method: 'Email' });
            } catch (error) {
                console.error("Erro no registro:", error);
                if (error.code === 'auth/email-already-in-use') {
                    authError.textContent = 'Este email já está em uso.';
                } else {
                    authError.textContent = 'Erro ao criar conta. Tente novamente.';
                }
            } finally {
                showLoading(false);
            }
        });

        document.getElementById('logout-button').addEventListener('click', async () => {
            await signOut(auth);
        });

        // --- Lógica de Gerenciamento de Bens ---
        const addBemModal = document.getElementById('add-bem-modal');
        const addBemForm = document.getElementById('add-bem-form');
        const addBemError = document.getElementById('add-bem-error');
        const conservacaoSlider = document.getElementById('bem-estado-conservacao');
        const conservacaoValue = document.getElementById('conservacao-value');

        document.getElementById('show-add-bem-modal').addEventListener('click', () => {
            addBemForm.reset();
            addBemError.textContent = '';
            document.getElementById('modal-title').textContent = 'Adicionar Novo Bem';
            conservacaoValue.textContent = '5';
            addBemModal.classList.remove('hidden');
        });

        document.getElementById('close-add-bem-modal').addEventListener('click', () => addBemModal.classList.add('hidden'));
        document.getElementById('cancel-add-bem').addEventListener('click', () => addBemModal.classList.add('hidden'));
        
        conservacaoSlider.addEventListener('input', (e) => {
            conservacaoValue.textContent = e.target.value;
        });

        addBemForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            showLoading(true);
            addBemError.textContent = '';

            const vidaUtilValue = document.getElementById('bem-vida-util').value;
            const estadoConservacaoValue = document.getElementById('bem-estado-conservacao').value;
            const fotoFile = document.getElementById('bem-foto').files[0];
            let fotoUrl = "";

            try {
                if (fotoFile) {
                    const storageRef = ref(storage, `patrimonios/${currentUser.uid}/${Date.now()}-${fotoFile.name}`);
                    const uploadResult = await uploadBytes(storageRef, fotoFile);
                    fotoUrl = await getDownloadURL(uploadResult.ref);
                }

                const bemData = {
                    orgao: document.getElementById('bem-orgao').value,
                    setor: document.getElementById('bem-setor').value,
                    codigoBem: document.getElementById('bem-codigo').value,
                    codigoAnterior: document.getElementById('bem-codigo-anterior').value,
                    descricao: document.getElementById('bem-descricao').value,
                    vidaUtil: Number(vidaUtilValue) || 0,
                    periodoUtilizacao: document.getElementById('bem-periodo-utilizacao').value,
                    estadoConservacao: Number(estadoConservacaoValue) || 0,
                    ocioso: document.getElementById('bem-ocioso').checked,
                    observacoes: document.getElementById('bem-observacoes').value,
                    fotoUrl: fotoUrl,
                    criadoPor: currentUser.uid,
                    criadoEm: Timestamp.fromDate(new Date())
                };

                const collectionPath = `artifacts/${appId}/users/${currentUser.uid}/patrimonios`;
                await addDoc(collection(db, collectionPath), bemData);
                
                logEvent(analytics, 'add_bem', { setor: bemData.setor });
                
                addBemModal.classList.add('hidden');
                addBemForm.reset();
            } catch (error) {
                console.error("Erro ao adicionar bem: ", error);
                addBemError.textContent = "Falha ao salvar. Verifique os dados e a conexão.";
            } finally {
                showLoading(false);
            }
        });
        
        function getBensCollectionRef() {
            if (!currentUser) return null;
            return collection(db, `artifacts/${appId}/users/${currentUser.uid}/patrimonios`);
        }

        function loadBens() {
            const bensCollection = getBensCollectionRef();
            if (!bensCollection) return;

            if (bensUnsubscribe) bensUnsubscribe();

            bensUnsubscribe = onSnapshot(bensCollection, (snapshot) => {
                currentBens = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                renderBensTable(currentBens);
                updateDashboard(currentBens);
            }, (error) => {
                console.error("Erro ao carregar bens:", error);
            });
        }

        function renderBensTable(bens) {
            const tableBody = document.getElementById('bens-table-body');
            if (bens.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-gray-500 dark:text-gray-400">Nenhum bem cadastrado.</td></tr>';
                return;
            }
            tableBody.innerHTML = bens.map(bem => `
                <tr class="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td class="p-4 font-medium">${bem.codigoBem}</td>
                    <td class="p-4">${bem.descricao}</td>
                    <td class="p-4">${bem.setor}</td>
                    <td class="p-4">${bem.estadoConservacao}/10</td>
                    <td class="p-4">
                        <span class="px-2 py-1 text-xs font-semibold rounded-full ${bem.ocioso ? 'bg-yellow-200 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300' : 'bg-green-200 text-green-800 dark:bg-green-900 dark:text-green-300'}">
                            ${bem.ocioso ? 'Ocioso' : 'Em uso'}
                        </span>
                    </td>
                    <td class="p-4 text-center space-x-2">
                        <button class="view-btn text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300" data-id="${bem.id}"><i class="fas fa-eye"></i></button>
                        <button class="pdf-btn text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300" data-id="${bem.id}"><i class="fas fa-file-pdf"></i></button>
                        <button class="delete-btn text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200" data-id="${bem.id}"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `).join('');
            
            document.querySelectorAll('.view-btn').forEach(btn => btn.addEventListener('click', (e) => viewBem(e.currentTarget.dataset.id, bens)));
            document.querySelectorAll('.pdf-btn').forEach(btn => btn.addEventListener('click', (e) => generatePDF(e.currentTarget.dataset.id, bens)));
            document.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', (e) => deleteBem(e.currentTarget.dataset.id)));
        }

        async function deleteBem(id) {
            const confirmed = await showConfirm("Excluir Bem", "Tem certeza que deseja excluir este bem? Esta ação é irreversível.");
            if (!confirmed) return;
            
            showLoading(true);
            try {
                const docRef = doc(db, `artifacts/${appId}/users/${currentUser.uid}/patrimonios`, id);
                await deleteDoc(docRef);
                showToast("Bem excluído com sucesso.", "success");
            } catch(error) {
                console.error("Erro ao deletar bem:", error);
                showToast("Não foi possível excluir o bem.");
            } finally {
                showLoading(false);
            }
        }
        
        // --- Lógica do Dashboard ---
        function updateDashboard(bens) {
            const totalBens = bens.length;
            const bensOciosos = bens.filter(b => b.ocioso).length;
            const setores = [...new Set(bens.map(b => b.setor))];
            const conservacaoTotal = bens.reduce((acc, b) => acc + (b.estadoConservacao || 0), 0);
            const conservacaoMedia = totalBens > 0 ? (conservacaoTotal / totalBens).toFixed(1) : 0;

            document.getElementById('total-bens').textContent = totalBens;
            document.getElementById('bens-ociosos').textContent = bensOciosos;
            document.getElementById('conservacao-media').textContent = `${conservacaoMedia}/10`;
            document.getElementById('total-setores').textContent = setores.length;
            
            updateCharts(bens, setores);
        }
        
        function updateCharts(bens, setores) {
            const isDarkMode = document.documentElement.classList.contains('dark');
            const textColor = isDarkMode ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.85)';
            const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

            Chart.defaults.color = textColor;

            const bensPorSetorCtx = document.getElementById('bensPorSetorChart').getContext('2d');
            const bensPorSetorData = setores.map(setor => bens.filter(b => b.setor === setor).length);
            
            if (bensPorSetorChartInstance) bensPorSetorChartInstance.destroy();
            bensPorSetorChartInstance = new Chart(bensPorSetorCtx, {
                type: 'doughnut',
                data: {
                    labels: setores,
                    datasets: [{
                        label: 'Bens por Setor',
                        data: bensPorSetorData,
                        backgroundColor: ['#3B82F6', '#F59E0B', '#10B981', '#8B5CF6', '#EC4899', '#6366F1'],
                        borderColor: isDarkMode ? '#1f2937' : '#fff'
                    }]
                },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false,
                    plugins: { legend: { labels: { color: textColor } } }
                }
            });

            const bensPorConservacaoCtx = document.getElementById('bensPorConservacaoChart').getContext('2d');
            const conservacaoLabels = Array.from({length: 10}, (_, i) => i + 1);
            const bensPorConservacaoData = conservacaoLabels.map(nota => bens.filter(b => b.estadoConservacao === nota).length);

            if (bensPorConservacaoChartInstance) bensPorConservacaoChartInstance.destroy();
            bensPorConservacaoChartInstance = new Chart(bensPorConservacaoCtx, {
                type: 'bar',
                data: {
                    labels: conservacaoLabels.map(n => `Nota ${n}`),
                    datasets: [{
                        label: 'Nº de Bens',
                        data: bensPorConservacaoData,
                        backgroundColor: '#3B82F6',
                        borderColor: '#1E40AF',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: { 
                        y: { 
                            beginAtZero: true,
                            grid: { color: gridColor },
                            ticks: { color: textColor }
                        },
                        x: {
                            grid: { color: gridColor },
                            ticks: { color: textColor }
                        }
                    },
                    plugins: { legend: { labels: { color: textColor } } }
                }
            });
        }

        // --- Lógica de Visualização e PDF ---
        const viewBemModal = document.getElementById('view-bem-modal');
        const viewBemContent = document.getElementById('view-bem-content');

        function viewBem(id, bens) {
            const bem = bens.find(b => b.id === id);
            if (!bem) return;
            
            viewBemContent.innerHTML = generateBemDetailHTML(bem, false, false, id);
            viewBemModal.classList.remove('hidden');
            
            const publicUrl = `${window.location.origin}${window.location.pathname}?view=public&userId=${currentUser.uid}&bemId=${id}`;
            new QRCode(document.getElementById("qrcode-view"), {
                text: publicUrl,
                width: 128,
                height: 128,
            });

            document.getElementById('close-view-modal').addEventListener('click', () => {
                viewBemModal.classList.add('hidden');
            });
        }
        
        async function generatePDF(id, bens) {
            const bem = bens.find(b => b.id === id);
            if (!bem) return;
            
            showLoading(true);
            
            const pdfContainer = document.createElement('div');
            pdfContainer.style.position = 'absolute';
            pdfContainer.style.left = '-9999px';
            pdfContainer.style.width = '800px';
            pdfContainer.innerHTML = generateBemDetailHTML(bem, true, false, id);
            document.body.appendChild(pdfContainer);

            const publicUrl = `${window.location.origin}${window.location.pathname}?view=public&userId=${currentUser.uid}&bemId=${id}`;
            new QRCode(pdfContainer.querySelector("#qrcode-view"), {
                text: publicUrl,
                width: 128,
                height: 128,
            });
            
            await new Promise(resolve => setTimeout(resolve, 400));

            try {
                const canvas = await html2canvas(pdfContainer, { scale: 2 });
                const imgData = canvas.toDataURL('image/png');
                const pdf = new jspdf.jsPDF({
                    orientation: 'portrait',
                    unit: 'px',
                    format: [canvas.width, canvas.height]
                });
                pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
                pdf.save(`FichaPatrimonial_${bem.codigoBem}.pdf`);
            } catch (error) {
                console.error("Erro ao gerar PDF:", error);
                showToast("Não foi possível gerar o PDF.");
            } finally {
                document.body.removeChild(pdfContainer);
                showLoading(false);
            }
        }
        
        function generateBemDetailHTML(bem, isPdfMode = false, isPublic = false, bemId = '') {
            const dataFormatada = bem.criadoEm.toDate ? bem.criadoEm.toDate().toLocaleDateString('pt-BR') : new Date(bem.criadoEm).toLocaleDateString('pt-BR');
            const placeholderImg = "https://placehold.co/200x150/e2e8f0/adb5bd?text=Foto+do+Bem";
            const fotoSrc = bem.fotoUrl || placeholderImg;

            return `
                <div id="pdf-content" class="p-8 bg-white dark:bg-gray-900 rounded-lg shadow-lg">
                    <div class="flex justify-between items-start border-b-2 pb-4 mb-4 border-gray-200 dark:border-gray-700">
                        <div>
                            <h3 class="text-3xl font-bold text-gray-800 dark:text-white">Ficha Patrimonial</h3>
                            <p class="text-gray-500 dark:text-gray-400">PatriScan System</p>
                        </div>
                        ${!isPdfMode && !isPublic ? '<button id="close-view-modal" class="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 text-3xl">&times;</button>' : ''}
                    </div>
                    <div class="grid grid-cols-12 gap-6">
                        <div class="col-span-12 md:col-span-8 space-y-4 text-gray-800 dark:text-gray-300">
                            <div class="grid grid-cols-2 gap-4">
                                <div><p class="text-sm text-gray-500 dark:text-gray-400">Código do Bem</p><p class="font-semibold text-lg">${bem.codigoBem}</p></div>
                                <div><p class="text-sm text-gray-500 dark:text-gray-400">Código Anterior</p><p class="font-semibold">${bem.codigoAnterior || 'N/A'}</p></div>
                            </div>
                            <div><p class="text-sm text-gray-500 dark:text-gray-400">Descrição</p><p class="font-semibold">${bem.descricao}</p></div>
                            <div class="grid grid-cols-2 gap-4">
                                <div><p class="text-sm text-gray-500 dark:text-gray-400">Órgão</p><p class="font-semibold">${bem.orgao}</p></div>
                                <div><p class="text-sm text-gray-500 dark:text-gray-400">Setor</p><p class="font-semibold">${bem.setor}</p></div>
                            </div>
                             <div class="grid grid-cols-2 gap-4">
                                <div><p class="text-sm text-gray-500 dark:text-gray-400">Vida Útil</p><p class="font-semibold">${bem.vidaUtil} anos</p></div>
                                <div><p class="text-sm text-gray-500 dark:text-gray-400">Período de Utilização</p><p class="font-semibold">${bem.periodoUtilizacao}</p></div>
                            </div>
                             <div class="grid grid-cols-2 gap-4">
                                <div><p class="text-sm text-gray-500 dark:text-gray-400">Estado de Conservação</p><p class="font-semibold">${bem.estadoConservacao}/10</p></div>
                                <div><p class="text-sm text-gray-500 dark:text-gray-400">Status</p><p class="font-semibold">${bem.ocioso ? 'Ocioso' : 'Em Uso'}</p></div>
                            </div>
                            <div><p class="text-sm text-gray-500 dark:text-gray-400">Observações</p><p class="font-semibold">${bem.observacoes || 'Nenhuma'}</p></div>
                        </div>
                        <div class="col-span-12 md:col-span-4 flex flex-col items-center justify-center space-y-2 bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
                            <div id="qrcode-view" class="flex items-center justify-center bg-white p-1 rounded-md"></div>
                            <p class="text-xs text-center text-gray-600 dark:text-gray-400">Escaneie para ver detalhes</p>
                            <img src="${fotoSrc}" alt="Foto do bem" class="mt-4 rounded-lg object-cover w-full h-auto">
                        </div>
                    </div>
                    <div class="border-t-2 pt-4 mt-6 text-sm text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700">
                        <p>Ficha gerada em ${new Date().toLocaleString('pt-BR')}. Cadastrado em ${dataFormatada}.</p>
                    </div>
                </div>
            `;
        }
        
        // --- Lógica de Exportação CSV ---
        document.getElementById('export-csv-button').addEventListener('click', async () => {
            showLoading(true);
            const bensCollection = getBensCollectionRef();
            if(!bensCollection) {
                showLoading(false);
                return;
            }
            
            const querySnapshot = await getDocs(bensCollection);
            const bens = querySnapshot.docs.map(doc => doc.data());

            if (bens.length === 0) {
                showToast("Nenhum bem para exportar.");
                showLoading(false);
                return;
            }

            logEvent(analytics, 'export_csv');

            const headers = Object.keys(bens[0]).join(',');
            const rows = bens.map(bem => {
                return Object.values(bem).map(value => {
                    const strValue = String(value);
                    if (strValue.includes(',')) return `"${strValue}"`;
                    return strValue;
                }).join(',');
            });

            const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].join('\n');
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", "patrimonio_export.csv");
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showLoading(false);
        });

        // --- Funções Utilitárias ---
        function showLoading(isLoading) {
            loadingSpinner.classList.toggle('hidden', !isLoading);
        }

        function resetUI() {
            document.getElementById('bens-table-body').innerHTML = '<tr><td colspan="6" class="p-4 text-center text-gray-500 dark:text-gray-400">Faça login para ver os bens.</td></tr>';
            currentBens = [];
            updateDashboard([]);
            if (bensPorSetorChartInstance) bensPorSetorChartInstance.destroy();
            if (bensPorConservacaoChartInstance) bensPorConservacaoChartInstance.destroy();
        }

        const confirmModal = document.getElementById('confirm-modal');
        function showConfirm(title, body) {
            return new Promise((resolve) => {
                document.getElementById('confirm-modal-title').textContent = title;
                document.getElementById('confirm-modal-body').textContent = body;
                confirmModal.classList.remove('hidden');

                document.getElementById('confirm-modal-cancel').onclick = () => {
                    confirmModal.classList.add('hidden');
                    resolve(false);
                };
                document.getElementById('confirm-modal-ok').onclick = () => {
                    confirmModal.classList.add('hidden');
                    resolve(true);
                };
            });
        }

        const toast = document.getElementById('toast-notification');
        const toastMessage = document.getElementById('toast-message');
        let toastTimeout;
        function showToast(message, type = 'error') {
            toastMessage.textContent = message;
            toast.classList.remove('bg-red-600', 'bg-green-600');
            if (type === 'success') {
                toast.classList.add('bg-green-600');
            } else {
                toast.classList.add('bg-red-600');
            }
            
            toast.classList.remove('hidden', 'opacity-0', '-translate-y-10');
            
            clearTimeout(toastTimeout);
            toastTimeout = setTimeout(() => {
                toast.classList.add('opacity-0', '-translate-y-10');
                setTimeout(() => toast.classList.add('hidden'), 500);
            }, 3000);
        }
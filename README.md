# Layout Forge

![MIT License](https://img.shields.io/badge/License-MIT-yellow.svg)

Uma aplicação de desktop simples e poderosa para organizar e preparar imagens para impressão em folhas A4, ideal para prototipagem de jogos de cartas e outros projetos de impressão.

---

### Demonstração

*(**DICA:** Grave um GIF curto mostrando o programa em ação e coloque aqui. É a melhor forma de mostrar o que ele faz! Ferramentas como ScreenToGif para Windows são ótimas para isso.)*

![Exemplo de GIF da aplicação](caminho/para/seu/gif.gif) 

---

### ✨ Features (O Que Ele Faz?)

* **Upload Intuitivo:** Arraste e solte múltiplas imagens diretamente na aplicação.
* **Layout Dinâmico:** Calcula automaticamente o número máximo de imagens que cabem em uma folha A4 com base nas dimensões fornecidas.
* **Organização Fácil:** Reordene as imagens arrastando e soltando, e duplique ou remova com um clique.
* **Opções de Saída Flexíveis:**
    * Estique imagens para preencher o espaço (`Stretch to Fit`).
    * Adicione ou remova uma borda fina para facilitar o corte.
* **Exportação Múltipla:**
    * Se o layout resultar em **uma única folha**, baixe como **JPG** ou **PDF**.
    * Se resultar em **múltiplas folhas**, baixe todas como um **pacote .zip** ou como um **único PDF de várias páginas**.
* **Abre a Pasta de Destino:** Após o download, a aplicação abre automaticamente a pasta de saída para acesso imediato aos seus arquivos.

---

### 📥 Download (Versão Pronta)

Você pode baixar a versão mais recente para Windows diretamente da nossa página de **[Releases](https://github.com/SEU_USUARIO/SEU_REPOSITORIO/releases)**.

Não é necessário instalar Python ou qualquer outra dependência. Basta baixar o arquivo `.zip`, extrair o `.exe` e executar.

---

### 🚀 Como Executar (a partir do Código Fonte)

Se você é um desenvolvedor e quer executar o projeto a partir do código, siga estes passos:

**Pré-requisitos:**
* Python 3.8+
* Git

**Passos:**

1.  **Clone o repositório:**
    ```bash
    git clone [https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git](https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git)
    cd SEU_REPOSITORIO
    ```

2.  **Crie um ambiente virtual (recomendado):**
    ```bash
    python -m venv .venv
    # No Windows
    .venv\Scripts\activate
    ```

3.  **Instale as dependências:**
    ```bash
    pip install -r requirements.txt
    ```

4.  **Execute a aplicação:**
    ```bash
    python app/main.py
    ```

---

### 🛠️ Tecnologias Utilizadas

* **Back-end:** Python, Flask, PyWebView, Pillow
* **Front-end:** HTML, Tailwind CSS, JavaScript, SortableJS
* **Empacotamento:** PyInstaller

---

### 📄 Licença

Este projeto é distribuído sob a Licença MIT. Veja o arquivo `LICENSE` para mais detalhes.

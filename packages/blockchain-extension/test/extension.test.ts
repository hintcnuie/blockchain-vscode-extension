/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/
import * as vscode from 'vscode';
import * as myExtension from '../extension/extension';
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
import * as path from 'path';
import { version as currentExtensionVersion } from '../package.json';
import { ExtensionUtil } from '../extension/util/ExtensionUtil';
import { DependencyManager } from '../extension/dependencies/DependencyManager';
import { VSCodeBlockchainOutputAdapter } from '../extension/logging/VSCodeBlockchainOutputAdapter';
import { TemporaryCommandRegistry } from '../extension/dependencies/TemporaryCommandRegistry';
import { TestUtil } from './TestUtil';
import { Reporter } from '../extension/util/Reporter';
import { ExtensionCommands } from '../ExtensionCommands';
import { LogType, FabricGatewayRegistry, FabricGatewayRegistryEntry, FabricEnvironmentRegistry, FabricEnvironmentRegistryEntry, EnvironmentType, EnvironmentFlags, FabricRuntimeUtil } from 'ibm-blockchain-platform-common';
import { SettingConfigurations } from '../extension/configurations';
import { UserInputUtil } from '../extension/commands/UserInputUtil';
import { dependencies } from '../package.json';
import { GlobalState, DEFAULT_EXTENSION_DATA, ExtensionData } from '../extension/util/GlobalState';
import { BlockchainGatewayExplorerProvider } from '../extension/explorer/gatewayExplorer';
import { BlockchainEnvironmentExplorerProvider } from '../extension/explorer/environmentExplorer';
import { BlockchainWalletExplorerProvider } from '../extension/explorer/walletExplorer';
import { LocalMicroEnvironmentManager } from '../extension/fabric/environments/LocalMicroEnvironmentManager';

chai.use(sinonChai);
chai.use(chaiAsPromised);

// tslint:disable no-unused-expression
describe('Extension Tests', () => {

    const mySandBox: sinon.SinonSandbox = sinon.createSandbox();
    let sendTelemetryStub: sinon.SinonStub;
    let getPackageJSONStub: sinon.SinonStub;
    let reporterDisposeStub: sinon.SinonStub;
    let logSpy: sinon.SinonSpy;
    let setupCommandsStub: sinon.SinonStub;
    let completeActivationStub: sinon.SinonStub;
    let setExtensionContextStub: sinon.SinonStub;
    let hasPreReqsInstalledStub: sinon.SinonStub;
    let registerPreActivationCommandsStub: sinon.SinonStub;
    let createTempCommandsStub: sinon.SinonStub;
    let showConfirmationWarningMessageStub: sinon.SinonStub;

    before(async () => {
        // We need this else TestUtil.setupTests() will fail when it tries to activate
        await TestUtil.setupTests(mySandBox);
        await vscode.workspace.getConfiguration().update(SettingConfigurations.EXTENSION_BYPASS_PREREQS, true, vscode.ConfigurationTarget.Global);
        await vscode.workspace.getConfiguration().update(SettingConfigurations.HOME_SHOW_ON_STARTUP, false, vscode.ConfigurationTarget.Global);
        await vscode.workspace.getConfiguration().update(SettingConfigurations.HOME_SHOW_ON_NEXT_ACTIVATION, false, vscode.ConfigurationTarget.Global);
    });

    beforeEach(async () => {
        mySandBox.restore();

        const extensionData: ExtensionData = DEFAULT_EXTENSION_DATA;
        extensionData.dockerForWindows = true;

        await GlobalState.update(extensionData);

        await vscode.workspace.getConfiguration().update(SettingConfigurations.FABRIC_RUNTIME, {}, vscode.ConfigurationTarget.Global);

        sendTelemetryStub = mySandBox.stub(Reporter.instance(), 'sendTelemetryEvent').resolves();

        await vscode.workspace.getConfiguration().update(SettingConfigurations.EXTENSION_BYPASS_PREREQS, false, vscode.ConfigurationTarget.Global);

        reporterDisposeStub = mySandBox.stub(Reporter.instance(), 'dispose');
        getPackageJSONStub = mySandBox.stub(ExtensionUtil, 'getPackageJSON').returns({ production: true });
        logSpy = mySandBox.spy(VSCodeBlockchainOutputAdapter.instance(), 'log');
        setupCommandsStub = mySandBox.stub(ExtensionUtil, 'setupCommands');
        completeActivationStub = mySandBox.stub(ExtensionUtil, 'completeActivation');
        setExtensionContextStub = mySandBox.stub(GlobalState, 'setExtensionContext');
        hasPreReqsInstalledStub = mySandBox.stub(DependencyManager.instance(), 'hasPreReqsInstalled');
        registerPreActivationCommandsStub = mySandBox.stub(ExtensionUtil, 'registerPreActivationCommands');
        createTempCommandsStub = mySandBox.stub(TemporaryCommandRegistry.instance(), 'createTempCommands');
        showConfirmationWarningMessageStub = mySandBox.stub(UserInputUtil, 'showConfirmationWarningMessage').withArgs(`Detected old local environments which can not be used with this upgrade. Would you like to teardown these environments?`).resolves(false);

    });

    afterEach(async () => {
        await GlobalState.reset();
        mySandBox.restore();
    });

    describe('activate', () => {

        it('should refresh the tree when a gateway connection is added', async () => {
            await FabricGatewayRegistry.instance().clear();

            const treeDataProvider: BlockchainGatewayExplorerProvider = ExtensionUtil.getBlockchainGatewayExplorerProvider();

            const treeSpy: sinon.SinonSpy = mySandBox.spy(treeDataProvider['_onDidChangeTreeData'], 'fire');

            const gateway: FabricGatewayRegistryEntry = new FabricGatewayRegistryEntry({
                name: 'myGateway',
                associatedWallet: '',
                connectionProfilePath: path.join('blockchain', 'extension', 'directory', 'gatewayOne', 'connection.json')
            });

            await FabricGatewayRegistry.instance().add(gateway);

            treeSpy.should.have.been.called;
        });

        it('should refresh all the trees when a environment connection is added', async () => {
            await FabricEnvironmentRegistry.instance().clear();

            const gatewayTreeDataProvider: BlockchainGatewayExplorerProvider = ExtensionUtil.getBlockchainGatewayExplorerProvider();

            const gatewayTreeSpy: sinon.SinonSpy = mySandBox.spy(gatewayTreeDataProvider['_onDidChangeTreeData'], 'fire');

            const environmentTreeDataProvider: BlockchainEnvironmentExplorerProvider = ExtensionUtil.getBlockchainEnvironmentExplorerProvider();

            const environmentTreeSpy: sinon.SinonSpy = mySandBox.spy(environmentTreeDataProvider['_onDidChangeTreeData'], 'fire');

            const walletTreeDataProvider: BlockchainWalletExplorerProvider = ExtensionUtil.getBlockchainWalletExplorerProvider();

            const walletTreeSpy: sinon.SinonSpy = mySandBox.spy(walletTreeDataProvider['_onDidChangeTreeData'], 'fire');

            const environment: FabricEnvironmentRegistryEntry = new FabricEnvironmentRegistryEntry({
                name: 'myEnvironment',
                environmentType: EnvironmentType.ENVIRONMENT
            });

            await FabricEnvironmentRegistry.instance().add(environment);

            environmentTreeSpy.should.have.been.called;
            gatewayTreeSpy.should.have.been.called;
            walletTreeSpy.should.have.been.called;
        });

        it('should activate if required dependencies are installed and prereq page has been shown before', async () => {
            setupCommandsStub.resolves();
            completeActivationStub.resolves();

            const context: vscode.ExtensionContext = GlobalState.getExtensionContext();
            setExtensionContextStub.returns(undefined);

            hasPreReqsInstalledStub.resolves(true);
            const executeCommandSpy: sinon.SinonSpy = mySandBox.spy(vscode.commands, 'executeCommand');

            registerPreActivationCommandsStub.resolves(context);
            createTempCommandsStub.returns(undefined);

            const extensionData: ExtensionData = DEFAULT_EXTENSION_DATA;
            extensionData.preReqPageShown = true;
            extensionData.dockerForWindows = true;
            extensionData.version = currentExtensionVersion;
            extensionData.generatorVersion = dependencies['generator-fabric'];
            extensionData.createOneOrgLocalFabric = true;
            extensionData.deletedOneOrgLocalFabric = false;
            await GlobalState.update(extensionData);

            await myExtension.activate(context);

            logSpy.should.have.been.calledWith(LogType.IMPORTANT, undefined, 'Log files can be found by running the `Developer: Open Logs Folder` command from the palette', undefined, true);
            logSpy.should.have.been.calledWith(LogType.INFO, undefined, 'Starting IBM Blockchain Platform Extension');

            setExtensionContextStub.should.have.been.calledTwice;

            createTempCommandsStub.should.have.been.calledOnceWith(true);
            setupCommandsStub.should.have.been.calledOnce;

            hasPreReqsInstalledStub.should.have.been.calledOnce;

            registerPreActivationCommandsStub.should.have.been.calledOnce;

            executeCommandSpy.should.not.have.been.calledWith(ExtensionCommands.OPEN_PRE_REQ_PAGE);

            completeActivationStub.should.have.been.called;
        });

        it('should dispose of the reporter instance production flag is false on extension activiation', async () => {

            getPackageJSONStub.returns({ production: false });
            reporterDisposeStub.resolves();

            setupCommandsStub.resolves();
            completeActivationStub.resolves();

            const context: vscode.ExtensionContext = GlobalState.getExtensionContext();
            setExtensionContextStub.returns(undefined);

            hasPreReqsInstalledStub.resolves(true);
            const executeCommandSpy: sinon.SinonSpy = mySandBox.spy(vscode.commands, 'executeCommand');

            registerPreActivationCommandsStub.resolves(context);
            createTempCommandsStub.returns(undefined);

            const extensionData: ExtensionData = DEFAULT_EXTENSION_DATA;
            extensionData.preReqPageShown = true;
            extensionData.dockerForWindows = true;
            extensionData.migrationCheck = 2;
            extensionData.version = currentExtensionVersion;
            extensionData.generatorVersion = dependencies['generator-fabric'];
            extensionData.createOneOrgLocalFabric = true;
            extensionData.deletedOneOrgLocalFabric = false;
            await GlobalState.update(extensionData);

            await myExtension.activate(context);

            logSpy.should.have.been.calledWith(LogType.IMPORTANT, undefined, 'Log files can be found by running the `Developer: Open Logs Folder` command from the palette', undefined, true);
            logSpy.should.have.been.calledWith(LogType.INFO, undefined, 'Starting IBM Blockchain Platform Extension');

            setExtensionContextStub.should.have.been.calledTwice;

            createTempCommandsStub.should.have.been.calledOnceWith(true);
            setupCommandsStub.should.have.been.calledOnce;

            hasPreReqsInstalledStub.should.have.been.calledOnce;

            registerPreActivationCommandsStub.should.have.been.calledOnce;

            executeCommandSpy.should.not.have.been.calledWith(ExtensionCommands.OPEN_PRE_REQ_PAGE);

            completeActivationStub.should.have.been.called;

            reporterDisposeStub.should.have.been.called;
        });

        it('should open prereq page if not shown before', async () => {

            setupCommandsStub.resolves();
            completeActivationStub.resolves();

            const context: vscode.ExtensionContext = GlobalState.getExtensionContext();
            setExtensionContextStub.returns(undefined);

            const executeCommandStub: sinon.SinonStub = mySandBox.stub(vscode.commands, 'executeCommand');
            executeCommandStub.callThrough();
            executeCommandStub.withArgs(ExtensionCommands.OPEN_PRE_REQ_PAGE).resolves();

            hasPreReqsInstalledStub.resolves(true);
            registerPreActivationCommandsStub.resolves(context);

            createTempCommandsStub.returns(undefined);
            const updateGlobalStateSpy: sinon.SinonSpy = mySandBox.spy(GlobalState, 'update');

            const extensionData: ExtensionData = DEFAULT_EXTENSION_DATA;
            extensionData.preReqPageShown = false;
            extensionData.dockerForWindows = true;
            extensionData.version = currentExtensionVersion;
            extensionData.generatorVersion = dependencies['generator-fabric'];
            extensionData.migrationCheck = 2;
            extensionData.createOneOrgLocalFabric = true;
            extensionData.deletedOneOrgLocalFabric = false;

            await GlobalState.update(extensionData);

            await myExtension.activate(context);

            logSpy.should.have.been.calledWith(LogType.IMPORTANT, undefined, 'Log files can be found by running the `Developer: Open Logs Folder` command from the palette', undefined, true);
            logSpy.should.have.been.calledWith(LogType.INFO, undefined, 'Starting IBM Blockchain Platform Extension');

            setExtensionContextStub.should.have.been.calledTwice;

            createTempCommandsStub.should.have.been.calledOnceWith(true);
            setupCommandsStub.should.have.been.calledOnce;

            hasPreReqsInstalledStub.should.have.been.calledOnce;
            registerPreActivationCommandsStub.should.have.been.calledOnce;

            executeCommandStub.should.have.been.calledWith(ExtensionCommands.OPEN_PRE_REQ_PAGE);

            const preReqPageShown: boolean = updateGlobalStateSpy.getCalls()[1].args[0].preReqPageShown;
            preReqPageShown.should.equal(true); // Should have updated the global state to say the PreReq page has now been shown

            completeActivationStub.should.have.been.calledOnce;

        });

        it('should open prereq page if required dependencies aren\'t installed', async () => {

            setupCommandsStub.resolves();
            completeActivationStub.resolves();

            const context: vscode.ExtensionContext = GlobalState.getExtensionContext();
            setExtensionContextStub.returns(undefined);

            const executeCommandStub: sinon.SinonStub = mySandBox.stub(vscode.commands, 'executeCommand');
            executeCommandStub.callThrough();
            executeCommandStub.withArgs(ExtensionCommands.OPEN_PRE_REQ_PAGE).resolves();

            hasPreReqsInstalledStub.resolves(false);
            registerPreActivationCommandsStub.resolves(context);
            createTempCommandsStub.returns(undefined);

            const extensionData: ExtensionData = DEFAULT_EXTENSION_DATA;
            extensionData.preReqPageShown = true;
            extensionData.dockerForWindows = true;
            extensionData.version = currentExtensionVersion;
            extensionData.generatorVersion = dependencies['generator-fabric'];
            extensionData.migrationCheck = 2;
            extensionData.createOneOrgLocalFabric = true;
            extensionData.deletedOneOrgLocalFabric = false;

            await GlobalState.update(extensionData);

            await myExtension.activate(context);

            logSpy.should.have.been.calledWith(LogType.IMPORTANT, undefined, 'Log files can be found by running the `Developer: Open Logs Folder` command from the palette', undefined, true);
            logSpy.should.have.been.calledWith(LogType.INFO, undefined, 'Starting IBM Blockchain Platform Extension');

            setExtensionContextStub.should.have.been.calledTwice;

            hasPreReqsInstalledStub.should.have.been.calledOnce;
            createTempCommandsStub.should.have.been.calledOnceWith(false, ExtensionCommands.OPEN_PRE_REQ_PAGE);
            setupCommandsStub.should.not.have.been.called;

            registerPreActivationCommandsStub.should.have.been.calledOnce;

            executeCommandStub.should.have.been.calledWith(ExtensionCommands.OPEN_PRE_REQ_PAGE);

            completeActivationStub.should.not.have.been.called;
        });

        it('should activate if the extension has been updated', async () => {

            const releaseNotesPath: string = path.join(ExtensionUtil.getExtensionPath(), 'RELEASE-NOTES.md');
            const releaseNotesUri: vscode.Uri = vscode.Uri.file(releaseNotesPath);
            setupCommandsStub.resolves();
            completeActivationStub.resolves();

            const context: vscode.ExtensionContext = GlobalState.getExtensionContext();
            setExtensionContextStub.returns(undefined);
            const executeCommandStub: sinon.SinonStub = mySandBox.stub(vscode.commands, 'executeCommand');
            executeCommandStub.callThrough();
            executeCommandStub.withArgs('markdown.showPreview', releaseNotesUri).resolves();
            hasPreReqsInstalledStub.resolves(true);
            registerPreActivationCommandsStub.resolves(context);
            createTempCommandsStub.returns(undefined);

            const extensionData: ExtensionData = DEFAULT_EXTENSION_DATA;
            extensionData.preReqPageShown = true;
            extensionData.dockerForWindows = true;
            extensionData.version = '2.0.0-beta.9';
            extensionData.generatorVersion = dependencies['generator-fabric'];
            extensionData.migrationCheck = 2;
            extensionData.createOneOrgLocalFabric = true;
            extensionData.deletedOneOrgLocalFabric = false;

            await GlobalState.update(extensionData);

            await myExtension.activate(context);

            sendTelemetryStub.should.have.been.calledWith('updatedInstall', { IBM: sinon.match.string });

            logSpy.should.have.been.calledWith(LogType.IMPORTANT, undefined, 'Log files can be found by running the `Developer: Open Logs Folder` command from the palette', undefined, true);
            logSpy.should.have.been.calledWith(LogType.INFO, undefined, 'Starting IBM Blockchain Platform Extension');

            setExtensionContextStub.should.have.been.calledTwice;

            hasPreReqsInstalledStub.should.have.been.calledOnce;
            createTempCommandsStub.should.have.been.calledOnceWith(true);
            setupCommandsStub.should.have.been.calledOnce;

            hasPreReqsInstalledStub.should.have.been.calledOnce;
            registerPreActivationCommandsStub.should.have.been.calledOnce;

            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.OPEN_PRE_REQ_PAGE);
            executeCommandStub.should.have.been.calledWith('markdown.showPreview', releaseNotesUri);

            completeActivationStub.should.have.been.calledOnce;
            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.DELETE_ENVIRONMENT);
        });

        it(`should delete any local environments or ansible environments`, async () => {

            const releaseNotesPath: string = path.join(ExtensionUtil.getExtensionPath(), 'RELEASE-NOTES.md');
            const releaseNotesUri: vscode.Uri = vscode.Uri.file(releaseNotesPath);
            setupCommandsStub.resolves();
            completeActivationStub.resolves();

            const context: vscode.ExtensionContext = GlobalState.getExtensionContext();
            setExtensionContextStub.returns(undefined);
            const executeCommandStub: sinon.SinonStub = mySandBox.stub(vscode.commands, 'executeCommand');
            executeCommandStub.callThrough();
            executeCommandStub.withArgs('markdown.showPreview', releaseNotesUri).resolves();
            executeCommandStub.withArgs(ExtensionCommands.DELETE_ENVIRONMENT).resolves();

            hasPreReqsInstalledStub.resolves(true);
            registerPreActivationCommandsStub.resolves(context);
            createTempCommandsStub.returns(undefined);

            const extensionData: ExtensionData = DEFAULT_EXTENSION_DATA;
            extensionData.preReqPageShown = true;
            extensionData.dockerForWindows = true;
            extensionData.version = '2.0.0-beta.9';
            extensionData.generatorVersion = dependencies['generator-fabric'];
            extensionData.migrationCheck = 2;
            extensionData.createOneOrgLocalFabric = true;
            extensionData.deletedOneOrgLocalFabric = false;

            await GlobalState.update(extensionData);

            const oldOtherEntry: FabricEnvironmentRegistryEntry = new FabricEnvironmentRegistryEntry({name: 'oldlocal', environmentType: EnvironmentType.LOCAL_ENVIRONMENT, numberOfOrgs: 1});
            const ansibleEntry: FabricEnvironmentRegistryEntry = new FabricEnvironmentRegistryEntry({name: 'oldAnsible', environmentType: EnvironmentType.ANSIBLE_ENVIRONMENT, environmentDirectory: '/some/path'});

            const getAllEnvironmentsStub: sinon.SinonStub = mySandBox.stub(FabricEnvironmentRegistry.instance(), 'getAll');
            getAllEnvironmentsStub.resolves([oldOtherEntry, ansibleEntry]);

            const initializeStub: sinon.SinonStub = mySandBox.stub(LocalMicroEnvironmentManager.instance(), 'initialize').resolves();

            await myExtension.activate(context);

            getAllEnvironmentsStub.should.have.been.calledOnceWithExactly([EnvironmentFlags.ANSIBLE]);
            executeCommandStub.should.have.been.calledWith(ExtensionCommands.DELETE_ENVIRONMENT, oldOtherEntry, true);
            executeCommandStub.should.have.been.calledWith(ExtensionCommands.DELETE_ENVIRONMENT, ansibleEntry, true);

            sendTelemetryStub.should.have.been.calledWith('updatedInstall', { IBM: sinon.match.string });
            initializeStub.should.not.have.been.called;
            logSpy.should.have.been.calledWith(LogType.IMPORTANT, undefined, 'Log files can be found by running the `Developer: Open Logs Folder` command from the palette', undefined, true);
            logSpy.should.have.been.calledWith(LogType.INFO, undefined, 'Starting IBM Blockchain Platform Extension');

            setExtensionContextStub.should.have.been.calledTwice;

            hasPreReqsInstalledStub.should.have.been.calledOnce;
            createTempCommandsStub.should.have.been.calledOnceWith(true);
            setupCommandsStub.should.have.been.calledOnce;

            hasPreReqsInstalledStub.should.have.been.calledOnce;
            registerPreActivationCommandsStub.should.have.been.calledOnce;

            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.OPEN_PRE_REQ_PAGE);
            executeCommandStub.should.have.been.calledWith('markdown.showPreview', releaseNotesUri);

            completeActivationStub.should.have.been.calledOnce;
        });

        it(`should delete any local environments and start a new ${FabricRuntimeUtil.LOCAL_FABRIC} if an older version existed`, async () => {

            const releaseNotesPath: string = path.join(ExtensionUtil.getExtensionPath(), 'RELEASE-NOTES.md');
            const releaseNotesUri: vscode.Uri = vscode.Uri.file(releaseNotesPath);
            setupCommandsStub.resolves();
            completeActivationStub.resolves();

            const context: vscode.ExtensionContext = GlobalState.getExtensionContext();
            setExtensionContextStub.returns(undefined);
            const executeCommandStub: sinon.SinonStub = mySandBox.stub(vscode.commands, 'executeCommand');
            executeCommandStub.callThrough();
            executeCommandStub.withArgs('markdown.showPreview', releaseNotesUri).resolves();
            executeCommandStub.withArgs(ExtensionCommands.DELETE_ENVIRONMENT).resolves();

            hasPreReqsInstalledStub.resolves(true);
            registerPreActivationCommandsStub.resolves(context);
            createTempCommandsStub.returns(undefined);

            const extensionData: ExtensionData = DEFAULT_EXTENSION_DATA;
            extensionData.preReqPageShown = true;
            extensionData.dockerForWindows = true;
            extensionData.version = '2.0.0-beta.9';
            extensionData.generatorVersion = dependencies['generator-fabric'];
            extensionData.migrationCheck = 2;
            extensionData.createOneOrgLocalFabric = true;
            extensionData.deletedOneOrgLocalFabric = false;

            await GlobalState.update(extensionData);

            const oldOneOrgEntry: FabricEnvironmentRegistryEntry = new FabricEnvironmentRegistryEntry({name: FabricRuntimeUtil.LOCAL_FABRIC, environmentType: EnvironmentType.LOCAL_ENVIRONMENT, numberOfOrgs: 1});
            const oldOtherEntry: FabricEnvironmentRegistryEntry = new FabricEnvironmentRegistryEntry({name: 'oldlocal', environmentType: EnvironmentType.LOCAL_ENVIRONMENT, numberOfOrgs: 1});

            const getAllEnvironmentsStub: sinon.SinonStub = mySandBox.stub(FabricEnvironmentRegistry.instance(), 'getAll');
            getAllEnvironmentsStub.resolves([oldOneOrgEntry, oldOtherEntry]);

            const initializeStub: sinon.SinonStub = mySandBox.stub(LocalMicroEnvironmentManager.instance(), 'initialize').resolves();

            await myExtension.activate(context);

            getAllEnvironmentsStub.should.have.been.calledOnceWithExactly([EnvironmentFlags.ANSIBLE]);
            executeCommandStub.should.have.been.calledWith(ExtensionCommands.DELETE_ENVIRONMENT, oldOneOrgEntry, true);
            executeCommandStub.should.have.been.calledWith(ExtensionCommands.DELETE_ENVIRONMENT, oldOtherEntry, true);
            sendTelemetryStub.should.have.been.calledWith('updatedInstall', { IBM: sinon.match.string });
            initializeStub.should.have.been.calledOnceWithExactly(FabricRuntimeUtil.LOCAL_FABRIC, 1);
            logSpy.should.have.been.calledWith(LogType.IMPORTANT, undefined, 'Log files can be found by running the `Developer: Open Logs Folder` command from the palette', undefined, true);
            logSpy.should.have.been.calledWith(LogType.INFO, undefined, 'Starting IBM Blockchain Platform Extension');

            setExtensionContextStub.should.have.been.calledTwice;

            hasPreReqsInstalledStub.should.have.been.calledOnce;
            createTempCommandsStub.should.have.been.calledOnceWith(true);
            setupCommandsStub.should.have.been.calledOnce;

            hasPreReqsInstalledStub.should.have.been.calledOnce;
            registerPreActivationCommandsStub.should.have.been.calledOnce;

            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.OPEN_PRE_REQ_PAGE);
            executeCommandStub.should.have.been.calledWith('markdown.showPreview', releaseNotesUri);

            completeActivationStub.should.have.been.calledOnce;
        });

        it('should remove any old settings', async () => {
            const releaseNotesPath: string = path.join(ExtensionUtil.getExtensionPath(), 'RELEASE-NOTES.md');
            const releaseNotesUri: vscode.Uri = vscode.Uri.file(releaseNotesPath);
            setupCommandsStub.resolves();
            completeActivationStub.resolves();

            const context: vscode.ExtensionContext = GlobalState.getExtensionContext();
            setExtensionContextStub.returns(undefined);
            const executeCommandStub: sinon.SinonStub = mySandBox.stub(vscode.commands, 'executeCommand');
            executeCommandStub.callThrough();
            executeCommandStub.withArgs('markdown.showPreview', releaseNotesUri).resolves();
            executeCommandStub.withArgs(ExtensionCommands.DELETE_ENVIRONMENT).resolves();

            hasPreReqsInstalledStub.resolves(true);
            registerPreActivationCommandsStub.resolves(context);
            createTempCommandsStub.returns(undefined);

            const extensionData: ExtensionData = DEFAULT_EXTENSION_DATA;
            extensionData.preReqPageShown = true;
            extensionData.dockerForWindows = true;
            extensionData.version = '2.0.0-beta.9';
            extensionData.generatorVersion = dependencies['generator-fabric'];
            extensionData.migrationCheck = 2;
            extensionData.createOneOrgLocalFabric = true;
            extensionData.deletedOneOrgLocalFabric = false;

            await GlobalState.update(extensionData);

            const oldOneOrgEntry: FabricEnvironmentRegistryEntry = new FabricEnvironmentRegistryEntry({name: FabricRuntimeUtil.LOCAL_FABRIC, environmentType: EnvironmentType.LOCAL_ENVIRONMENT, numberOfOrgs: 1});
            const oldOtherEntry: FabricEnvironmentRegistryEntry = new FabricEnvironmentRegistryEntry({name: 'oldlocal', environmentType: EnvironmentType.LOCAL_ENVIRONMENT, numberOfOrgs: 1});

            const getAllEnvironmentsStub: sinon.SinonStub = mySandBox.stub(FabricEnvironmentRegistry.instance(), 'getAll');
            getAllEnvironmentsStub.resolves([oldOneOrgEntry, oldOtherEntry]);

            const initializeStub: sinon.SinonStub = mySandBox.stub(LocalMicroEnvironmentManager.instance(), 'initialize').resolves();

            const originalSettings: any = vscode.workspace.getConfiguration().get(SettingConfigurations.FABRIC_RUNTIME, vscode.ConfigurationTarget.Global);
            const newSettings: any  = Object.assign({otherLocal: {startPort: 1000, endPort: 2000}, anotherLocal: {startPort: 3000, endPort: 4000}, microfabLocal: 9001}, originalSettings);
            await vscode.workspace.getConfiguration().update(SettingConfigurations.FABRIC_RUNTIME, newSettings, vscode.ConfigurationTarget.Global);

            await myExtension.activate(context);
            const finalSettings: any = vscode.workspace.getConfiguration().get(SettingConfigurations.FABRIC_RUNTIME, vscode.ConfigurationTarget.Global);
            finalSettings.should.deep.equal({
                microfabLocal: 9001
            });
            getAllEnvironmentsStub.should.have.been.calledOnceWithExactly([EnvironmentFlags.ANSIBLE]);
            executeCommandStub.should.have.been.calledWith(ExtensionCommands.DELETE_ENVIRONMENT, oldOneOrgEntry, true);
            executeCommandStub.should.have.been.calledWith(ExtensionCommands.DELETE_ENVIRONMENT, oldOtherEntry, true);
            sendTelemetryStub.should.have.been.calledWith('updatedInstall', { IBM: sinon.match.string });
            initializeStub.should.have.been.calledOnceWithExactly(FabricRuntimeUtil.LOCAL_FABRIC, 1);
            logSpy.should.have.been.calledWith(LogType.IMPORTANT, undefined, 'Log files can be found by running the `Developer: Open Logs Folder` command from the palette', undefined, true);
            logSpy.should.have.been.calledWith(LogType.INFO, undefined, 'Starting IBM Blockchain Platform Extension');
            setExtensionContextStub.should.have.been.calledTwice;

            hasPreReqsInstalledStub.should.have.been.calledOnce;
            createTempCommandsStub.should.have.been.calledOnceWith(true);
            setupCommandsStub.should.have.been.calledOnce;

            hasPreReqsInstalledStub.should.have.been.calledOnce;
            registerPreActivationCommandsStub.should.have.been.calledOnce;

            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.OPEN_PRE_REQ_PAGE);
            executeCommandStub.should.have.been.calledWith('markdown.showPreview', releaseNotesUri);

            completeActivationStub.should.have.been.calledOnce;
        });

        it('should set global state properties if a previous version has been used', async () => {
            const releaseNotesPath: string = path.join(ExtensionUtil.getExtensionPath(), 'RELEASE-NOTES.md');
            const releaseNotesUri: vscode.Uri = vscode.Uri.file(releaseNotesPath);
            setupCommandsStub.resolves();
            completeActivationStub.resolves();

            const context: vscode.ExtensionContext = GlobalState.getExtensionContext();
            setExtensionContextStub.returns(undefined);
            const executeCommandStub: sinon.SinonStub = mySandBox.stub(vscode.commands, 'executeCommand');
            executeCommandStub.callThrough();
            executeCommandStub.withArgs('markdown.showPreview', releaseNotesUri).resolves();
            hasPreReqsInstalledStub.resolves(true);
            registerPreActivationCommandsStub.resolves(context);
            createTempCommandsStub.returns(undefined);

            const extensionData: ExtensionData = DEFAULT_EXTENSION_DATA;
            extensionData.preReqPageShown = true;
            extensionData.dockerForWindows = true;
            extensionData.version = '1.0.6';
            extensionData.generatorVersion = dependencies['generator-fabric'];
            extensionData.migrationCheck = 2;
            extensionData.createOneOrgLocalFabric = undefined;
            extensionData.deletedOneOrgLocalFabric = undefined;

            await GlobalState.update(extensionData);

            const showInformationMessageStub: sinon.SinonStub = mySandBox.stub(vscode.window, 'showInformationMessage').resolves(undefined);

            await myExtension.activate(context);

            const newExtData: ExtensionData = GlobalState.get();
            newExtData.createOneOrgLocalFabric.should.equal(true);
            newExtData.deletedOneOrgLocalFabric.should.equal(false);

            sendTelemetryStub.should.have.been.calledWith('updatedInstall', { IBM: sinon.match.string });

            logSpy.should.have.been.calledWith(LogType.IMPORTANT, undefined, 'Log files can be found by running the `Developer: Open Logs Folder` command from the palette', undefined, true);
            logSpy.should.have.been.calledWith(LogType.INFO, undefined, 'Starting IBM Blockchain Platform Extension');

            setExtensionContextStub.should.have.been.calledTwice;

            hasPreReqsInstalledStub.should.have.been.calledOnce;
            createTempCommandsStub.should.have.been.calledOnceWith(true);
            setupCommandsStub.should.have.been.calledOnce;

            hasPreReqsInstalledStub.should.have.been.calledOnce;
            registerPreActivationCommandsStub.should.have.been.calledOnce;
            showInformationMessageStub.should.have.been.calledOnce;

            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.OPEN_PRE_REQ_PAGE);
            executeCommandStub.should.have.been.calledWith('markdown.showPreview', releaseNotesUri);
            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.DELETE_ENVIRONMENT);
            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.OPEN_FABRIC_2_PAGE);
            completeActivationStub.should.have.been.calledOnce;
        });

        it('should not open release notes on first ever install', async () => {

            setupCommandsStub.resolves();
            completeActivationStub.resolves();

            const context: vscode.ExtensionContext = GlobalState.getExtensionContext();
            setExtensionContextStub.returns(undefined);
            const executeCommandSpy: sinon.SinonSpy = mySandBox.spy(vscode.commands, 'executeCommand');

            hasPreReqsInstalledStub.resolves(true);
            registerPreActivationCommandsStub.resolves(context);
            createTempCommandsStub.returns(undefined);

            const extensionData: ExtensionData = DEFAULT_EXTENSION_DATA;
            extensionData.preReqPageShown = true;
            extensionData.dockerForWindows = true;
            extensionData.version = null;
            extensionData.generatorVersion = null;
            extensionData.migrationCheck = 2;
            extensionData.createOneOrgLocalFabric = true;
            extensionData.deletedOneOrgLocalFabric = false;

            await GlobalState.update(extensionData);

            await myExtension.activate(context);

            sendTelemetryStub.should.have.been.calledWith('newInstall', { IBM: sinon.match.string });

            logSpy.should.have.been.calledWith(LogType.IMPORTANT, undefined, 'Log files can be found by running the `Developer: Open Logs Folder` command from the palette', undefined, true);
            logSpy.should.have.been.calledWith(LogType.INFO, undefined, 'Starting IBM Blockchain Platform Extension');

            setExtensionContextStub.should.have.been.calledTwice;

            hasPreReqsInstalledStub.should.have.been.calledOnce;
            createTempCommandsStub.should.have.been.calledOnceWith(true);
            setupCommandsStub.should.have.been.calledOnce;

            hasPreReqsInstalledStub.should.have.been.calledOnce;
            registerPreActivationCommandsStub.should.have.been.calledOnce;

            executeCommandSpy.should.not.have.been.calledWith(ExtensionCommands.OPEN_PRE_REQ_PAGE);
            executeCommandSpy.should.not.have.been.calledWith('markdown.showPreview');

            completeActivationStub.should.have.been.calledOnce;
        });

        it(`should report that the release notes can't be opened`, async () => {
            const releaseNotesPath: string = path.join(ExtensionUtil.getExtensionPath(), 'RELEASE-NOTES.md');
            const releaseNotesUri: vscode.Uri = vscode.Uri.file(releaseNotesPath);
            const executeCommandStub: sinon.SinonStub = mySandBox.stub(vscode.commands, 'executeCommand');
            executeCommandStub.callThrough();

            const error: Error = new Error('unable to preview markdown');
            executeCommandStub.withArgs('markdown.showPreview', releaseNotesUri).throws(error);
            setupCommandsStub.resolves();
            completeActivationStub.resolves();

            const context: vscode.ExtensionContext = GlobalState.getExtensionContext();
            setExtensionContextStub.returns(undefined);
            hasPreReqsInstalledStub.resolves(true);
            registerPreActivationCommandsStub.resolves(context);
            createTempCommandsStub.returns(undefined);

            const extensionData: ExtensionData = DEFAULT_EXTENSION_DATA;
            extensionData.preReqPageShown = true;
            extensionData.dockerForWindows = true;
            extensionData.version = '1.0.6';
            extensionData.generatorVersion = dependencies['generator-fabric'];
            extensionData.migrationCheck = 2;
            extensionData.createOneOrgLocalFabric = true;
            extensionData.deletedOneOrgLocalFabric = false;

            const showInformationMessageStub: sinon.SinonStub = mySandBox.stub(vscode.window, 'showInformationMessage').resolves(undefined);

            await GlobalState.update(extensionData);

            await myExtension.activate(context);

            sendTelemetryStub.should.have.been.calledWith('updatedInstall', { IBM: sinon.match.string });

            logSpy.should.have.been.calledWith(LogType.IMPORTANT, undefined, 'Log files can be found by running the `Developer: Open Logs Folder` command from the palette', undefined, true);
            logSpy.should.have.been.calledWith(LogType.INFO, undefined, 'Starting IBM Blockchain Platform Extension');
            logSpy.should.have.been.calledWith(LogType.ERROR, `Unable to open release notes: ${error.toString()}`);

            setExtensionContextStub.should.have.been.calledTwice;

            hasPreReqsInstalledStub.should.have.been.calledOnce;
            createTempCommandsStub.should.have.been.calledOnceWith(true);
            setupCommandsStub.should.have.been.calledOnce;

            hasPreReqsInstalledStub.should.have.been.calledOnce;
            registerPreActivationCommandsStub.should.have.been.calledOnce;

            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.OPEN_PRE_REQ_PAGE);
            executeCommandStub.should.have.been.calledWith('markdown.showPreview', releaseNotesUri);
            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.DELETE_ENVIRONMENT);
            completeActivationStub.should.have.been.calledOnce;

            showInformationMessageStub.should.have.been.calledOnce;
            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.OPEN_FABRIC_2_PAGE);

        });

        it('should activate extension and bypass prereqs', async () => {
            const releaseNotesPath: string = path.join(ExtensionUtil.getExtensionPath(), 'RELEASE-NOTES.md');
            const releaseNotesUri: vscode.Uri = vscode.Uri.file(releaseNotesPath);

            await vscode.workspace.getConfiguration().update(SettingConfigurations.EXTENSION_BYPASS_PREREQS, true, vscode.ConfigurationTarget.Global);

            setupCommandsStub.resolves();
            completeActivationStub.resolves();
            const context: vscode.ExtensionContext = GlobalState.getExtensionContext();
            setExtensionContextStub.returns(undefined);
            const executeCommandStub: sinon.SinonStub = mySandBox.stub(vscode.commands, 'executeCommand');
            executeCommandStub.callThrough();
            executeCommandStub.withArgs('markdown.showPreview', releaseNotesUri).resolves();
            hasPreReqsInstalledStub.resolves(true);
            registerPreActivationCommandsStub.resolves(context);
            createTempCommandsStub.returns(undefined);

            const extensionData: ExtensionData = DEFAULT_EXTENSION_DATA;
            extensionData.preReqPageShown = true;
            extensionData.dockerForWindows = true;
            extensionData.version = '1.0.6';
            extensionData.generatorVersion = dependencies['generator-fabric'];
            extensionData.migrationCheck = 2;
            extensionData.createOneOrgLocalFabric = true;
            extensionData.deletedOneOrgLocalFabric = false;

            const showInformationMessageStub: sinon.SinonStub = mySandBox.stub(vscode.window, 'showInformationMessage').resolves(undefined);

            await GlobalState.update(extensionData);

            await myExtension.activate(context);

            sendTelemetryStub.should.have.been.calledWith('updatedInstall', { IBM: sinon.match.string });

            logSpy.should.have.been.calledWith(LogType.IMPORTANT, undefined, 'Log files can be found by running the `Developer: Open Logs Folder` command from the palette', undefined, true);
            logSpy.should.have.been.calledWith(LogType.INFO, undefined, 'Starting IBM Blockchain Platform Extension');

            setExtensionContextStub.should.have.been.calledTwice;
            hasPreReqsInstalledStub.should.not.have.been.called;
            createTempCommandsStub.should.have.been.calledOnceWith(true);
            setupCommandsStub.should.have.been.calledOnce;
            registerPreActivationCommandsStub.should.have.been.calledOnce;

            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.OPEN_PRE_REQ_PAGE);
            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.DELETE_ENVIRONMENT);
            completeActivationStub.should.have.been.calledOnce;

            showInformationMessageStub.should.have.been.calledOnce;
            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.OPEN_FABRIC_2_PAGE);

        });

        it(`should open 'whats new page' when major extension version has been updated and user selects 'Read more'`, async () => {
            const releaseNotesPath: string = path.join(ExtensionUtil.getExtensionPath(), 'RELEASE-NOTES.md');
            const releaseNotesUri: vscode.Uri = vscode.Uri.file(releaseNotesPath);

            await vscode.workspace.getConfiguration().update(SettingConfigurations.EXTENSION_BYPASS_PREREQS, true, vscode.ConfigurationTarget.Global);

            setupCommandsStub.resolves();
            completeActivationStub.resolves();
            const context: vscode.ExtensionContext = GlobalState.getExtensionContext();
            setExtensionContextStub.returns(undefined);
            const executeCommandStub: sinon.SinonStub = mySandBox.stub(vscode.commands, 'executeCommand');
            executeCommandStub.callThrough();
            executeCommandStub.withArgs('markdown.showPreview', releaseNotesUri).resolves();
            executeCommandStub.withArgs(ExtensionCommands.OPEN_FABRIC_2_PAGE).resolves();
            hasPreReqsInstalledStub.resolves(true);
            registerPreActivationCommandsStub.resolves(context);
            createTempCommandsStub.returns(undefined);

            const extensionData: ExtensionData = DEFAULT_EXTENSION_DATA;
            extensionData.preReqPageShown = true;
            extensionData.dockerForWindows = true;
            extensionData.version = '1.0.6';
            extensionData.generatorVersion = dependencies['generator-fabric'];
            extensionData.migrationCheck = 2;
            extensionData.createOneOrgLocalFabric = true;
            extensionData.deletedOneOrgLocalFabric = false;

            const showInformationMessageStub: sinon.SinonStub = mySandBox.stub(vscode.window, 'showInformationMessage').resolves('Learn more');

            await GlobalState.update(extensionData);

            await myExtension.activate(context);

            sendTelemetryStub.should.have.been.calledWith('updatedInstall', { IBM: sinon.match.string });

            logSpy.should.have.been.calledWith(LogType.IMPORTANT, undefined, 'Log files can be found by running the `Developer: Open Logs Folder` command from the palette', undefined, true);
            logSpy.should.have.been.calledWith(LogType.INFO, undefined, 'Starting IBM Blockchain Platform Extension');

            setExtensionContextStub.should.have.been.calledTwice;
            hasPreReqsInstalledStub.should.not.have.been.called;
            createTempCommandsStub.should.have.been.calledOnceWith(true);
            setupCommandsStub.should.have.been.calledOnce;
            registerPreActivationCommandsStub.should.have.been.calledOnce;

            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.OPEN_PRE_REQ_PAGE);
            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.DELETE_ENVIRONMENT);
            completeActivationStub.should.have.been.calledOnce;

            showInformationMessageStub.should.have.been.calledOnce;
            executeCommandStub.should.have.been.calledWith(ExtensionCommands.OPEN_FABRIC_2_PAGE);

        });

        it('should report if a new user has installed the extension', async () => {

            setupCommandsStub.resolves();
            completeActivationStub.resolves();
            const context: vscode.ExtensionContext = GlobalState.getExtensionContext();
            setExtensionContextStub.returns(undefined);

            const executeCommandStub: sinon.SinonStub = mySandBox.stub(vscode.commands, 'executeCommand');
            executeCommandStub.callThrough();

            hasPreReqsInstalledStub.resolves(true);
            registerPreActivationCommandsStub.resolves(context);
            createTempCommandsStub.returns(undefined);

            const extensionData: ExtensionData = DEFAULT_EXTENSION_DATA;
            extensionData.preReqPageShown = true;
            extensionData.dockerForWindows = true;
            extensionData.version = null;
            extensionData.generatorVersion = null;
            extensionData.migrationCheck = 2;
            extensionData.createOneOrgLocalFabric = true;
            extensionData.deletedOneOrgLocalFabric = false;

            await GlobalState.update(extensionData);

            await myExtension.activate(context);

            sendTelemetryStub.should.have.been.calledWith('newInstall', { IBM: sinon.match.string });

            logSpy.should.have.been.calledWith(LogType.IMPORTANT, undefined, 'Log files can be found by running the `Developer: Open Logs Folder` command from the palette', undefined, true);
            logSpy.should.have.been.calledWith(LogType.INFO, undefined, 'Starting IBM Blockchain Platform Extension');

            setExtensionContextStub.should.have.been.calledTwice;

            createTempCommandsStub.should.have.been.calledOnceWith(true);
            hasPreReqsInstalledStub.should.have.been.calledOnce;
            setupCommandsStub.should.have.been.calledOnce;
            registerPreActivationCommandsStub.should.have.been.calledOnce;

            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.OPEN_PRE_REQ_PAGE);

            completeActivationStub.should.have.been.calledOnce;
        });

        it('should handle any errors when the extension fails to activate', async () => {
            const context: vscode.ExtensionContext = GlobalState.getExtensionContext();
            setExtensionContextStub.returns(undefined);

            const releaseNotesPath: string = path.join(ExtensionUtil.getExtensionPath(), 'RELEASE-NOTES.md');
            const releaseNotesUri: vscode.Uri = vscode.Uri.file(releaseNotesPath);

            const extensionData: ExtensionData = DEFAULT_EXTENSION_DATA;
            extensionData.preReqPageShown = true;
            extensionData.dockerForWindows = true;
            extensionData.version = currentExtensionVersion;
            extensionData.generatorVersion = '1.0.6';
            extensionData.migrationCheck = 2;
            extensionData.createOneOrgLocalFabric = true;
            extensionData.deletedOneOrgLocalFabric = false;

            const showInformationMessageStub: sinon.SinonStub = mySandBox.stub(vscode.window, 'showInformationMessage').resolves(undefined);

            await GlobalState.update(extensionData);
            const error: Error = new Error('some error');

            hasPreReqsInstalledStub.rejects(error);

            const executeCommandStub: sinon.SinonStub = mySandBox.stub(vscode.commands, 'executeCommand');
            executeCommandStub.callThrough();
            executeCommandStub.withArgs('markdown.showPreview', releaseNotesUri).resolves();

            const failedActivationWindowStub: sinon.SinonStub = mySandBox.stub(UserInputUtil, 'failedActivationWindow').resolves();

            await myExtension.activate(context);
            setExtensionContextStub.should.have.been.calledOnce;

            hasPreReqsInstalledStub.should.have.been.called;
            failedActivationWindowStub.should.have.been.calledOnceWithExactly('some error');
            sendTelemetryStub.should.have.been.calledWith('activationFailed', { activationError: 'some error' });
            logSpy.should.have.been.calledWith(LogType.ERROR, undefined, `Failed to activate extension: ${error.toString()}`, error.stack);
            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.DELETE_ENVIRONMENT);

            showInformationMessageStub.should.not.have.been.called;
            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.OPEN_FABRIC_2_PAGE);
        });

        it('should add home page button to the status bar', async () => {
            const releaseNotesPath: string = path.join(ExtensionUtil.getExtensionPath(), 'RELEASE-NOTES.md');
            const releaseNotesUri: vscode.Uri = vscode.Uri.file(releaseNotesPath);

            setupCommandsStub.resolves();
            completeActivationStub.resolves();
            const context: vscode.ExtensionContext = GlobalState.getExtensionContext();
            setExtensionContextStub.returns(undefined);
            hasPreReqsInstalledStub.resolves(true);
            registerPreActivationCommandsStub.resolves(context);
            createTempCommandsStub.returns(undefined);

            const extensionData: ExtensionData = DEFAULT_EXTENSION_DATA;
            extensionData.preReqPageShown = true;
            extensionData.dockerForWindows = true;
            extensionData.version = '1.0.6';
            extensionData.generatorVersion = dependencies['generator-fabric'];
            extensionData.migrationCheck = 2;
            await GlobalState.update(extensionData);

            const executeCommandStub: sinon.SinonStub = mySandBox.stub(vscode.commands, 'executeCommand');
            executeCommandStub.callThrough();
            executeCommandStub.withArgs('markdown.showPreview', releaseNotesUri).resolves();
            const showInformationMessageStub: sinon.SinonStub = mySandBox.stub(vscode.window, 'showInformationMessage').resolves(undefined);

            await myExtension.activate(context);

            sendTelemetryStub.should.have.been.calledWith('updatedInstall', { IBM: sinon.match.string });

            logSpy.should.have.been.calledWith(LogType.IMPORTANT, undefined, 'Log files can be found by running the `Developer: Open Logs Folder` command from the palette', undefined, true);
            logSpy.should.have.been.calledWith(LogType.INFO, undefined, 'Starting IBM Blockchain Platform Extension');

            setExtensionContextStub.should.have.been.calledTwice;
            createTempCommandsStub.should.have.been.calledOnceWith(true);
            setupCommandsStub.should.have.been.calledOnce;
            registerPreActivationCommandsStub.should.have.been.calledOnce;

            completeActivationStub.should.have.been.calledOnce;

            const newContext: vscode.ExtensionContext = GlobalState.getExtensionContext();
            const homePageButton: any = newContext.subscriptions.find((subscription: any) => {
                return subscription.text === 'Blockchain Home';
            });
            homePageButton.tooltip.should.equal('View Homepage');
            homePageButton.command.should.equal(ExtensionCommands.OPEN_HOME_PAGE);

            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.DELETE_ENVIRONMENT);

            showInformationMessageStub.should.have.been.calledOnce;
            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.OPEN_FABRIC_2_PAGE);

        });

        it(`should ask user if they want to teardown old (v1 extension) local ansible environments if present when major extension version has been updated`, async () => {
            const releaseNotesPath: string = path.join(ExtensionUtil.getExtensionPath(), 'RELEASE-NOTES.md');
            const releaseNotesUri: vscode.Uri = vscode.Uri.file(releaseNotesPath);

            const v1AnsibleLocal: FabricEnvironmentRegistryEntry = new FabricEnvironmentRegistryEntry({name: 'v1Ansible', environmentType: EnvironmentType.MANAGED, environmentDirectory: '/some/path'});
            const getAllEnvironmentsStub: sinon.SinonStub = mySandBox.stub(FabricEnvironmentRegistry.instance(), 'getAll');
            getAllEnvironmentsStub.onFirstCall().resolves([v1AnsibleLocal]);
            getAllEnvironmentsStub.onSecondCall().resolves([]);

            await vscode.workspace.getConfiguration().update(SettingConfigurations.EXTENSION_BYPASS_PREREQS, true, vscode.ConfigurationTarget.Global);
            setupCommandsStub.resolves();
            completeActivationStub.resolves();
            const context: vscode.ExtensionContext = GlobalState.getExtensionContext();
            setExtensionContextStub.returns(undefined);
            const executeCommandStub: sinon.SinonStub = mySandBox.stub(vscode.commands, 'executeCommand');
            executeCommandStub.callThrough();
            executeCommandStub.withArgs('markdown.showPreview', releaseNotesUri).resolves();
            executeCommandStub.withArgs(ExtensionCommands.OPEN_FABRIC_2_PAGE).resolves();
            executeCommandStub.withArgs(ExtensionCommands.TEARDOWN_FABRIC, undefined, true, v1AnsibleLocal.name, true).resolves();
            hasPreReqsInstalledStub.resolves(true);
            registerPreActivationCommandsStub.resolves(context);
            createTempCommandsStub.returns(undefined);

            const extensionData: ExtensionData = DEFAULT_EXTENSION_DATA;
            extensionData.preReqPageShown = true;
            extensionData.dockerForWindows = true;
            extensionData.version = '1.0.6';
            extensionData.generatorVersion = dependencies['generator-fabric'];
            extensionData.migrationCheck = 2;
            extensionData.createOneOrgLocalFabric = true;
            extensionData.deletedOneOrgLocalFabric = false;

            const showInformationMessageStub: sinon.SinonStub = mySandBox.stub(vscode.window, 'showInformationMessage').resolves('Learn more');

            await GlobalState.update(extensionData);

            await myExtension.activate(context);

            sendTelemetryStub.should.have.been.calledWith('updatedInstall', { IBM: sinon.match.string });

            logSpy.should.have.been.calledWith(LogType.IMPORTANT, undefined, 'Log files can be found by running the `Developer: Open Logs Folder` command from the palette', undefined, true);
            logSpy.should.have.been.calledWith(LogType.INFO, undefined, 'Starting IBM Blockchain Platform Extension');

            showConfirmationWarningMessageStub.should.have.been.calledOnce;
            setExtensionContextStub.should.have.been.calledTwice;
            hasPreReqsInstalledStub.should.not.have.been.called;
            createTempCommandsStub.should.have.been.calledOnceWith(true);
            setupCommandsStub.should.have.been.calledOnce;
            registerPreActivationCommandsStub.should.have.been.calledOnce;
            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.TEARDOWN_FABRIC, undefined, true, v1AnsibleLocal.name, true);

            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.OPEN_PRE_REQ_PAGE);
            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.DELETE_ENVIRONMENT);
            completeActivationStub.should.have.been.calledOnce;

            showInformationMessageStub.should.have.been.calledOnce;
            executeCommandStub.should.have.been.calledWith(ExtensionCommands.OPEN_FABRIC_2_PAGE);

        });

        it(`should teardown old v1 ansible local environments if present and user agrees when major extension version has been updated`, async () => {
            const releaseNotesPath: string = path.join(ExtensionUtil.getExtensionPath(), 'RELEASE-NOTES.md');
            const releaseNotesUri: vscode.Uri = vscode.Uri.file(releaseNotesPath);

            const v1AnsibleLocal: FabricEnvironmentRegistryEntry = new FabricEnvironmentRegistryEntry({name: 'v1Ansible', environmentType: EnvironmentType.MANAGED, environmentDirectory: '/some/path'});
            const getAllEnvironmentsStub: sinon.SinonStub = mySandBox.stub(FabricEnvironmentRegistry.instance(), 'getAll');
            getAllEnvironmentsStub.onFirstCall().resolves([v1AnsibleLocal]);
            getAllEnvironmentsStub.onSecondCall().resolves([]);
            showConfirmationWarningMessageStub.resolves(true);

            await vscode.workspace.getConfiguration().update(SettingConfigurations.EXTENSION_BYPASS_PREREQS, true, vscode.ConfigurationTarget.Global);
            setupCommandsStub.resolves();
            completeActivationStub.resolves();
            const context: vscode.ExtensionContext = GlobalState.getExtensionContext();
            setExtensionContextStub.returns(undefined);
            const executeCommandStub: sinon.SinonStub = mySandBox.stub(vscode.commands, 'executeCommand');
            executeCommandStub.callThrough();
            executeCommandStub.withArgs('markdown.showPreview', releaseNotesUri).resolves();
            executeCommandStub.withArgs(ExtensionCommands.OPEN_FABRIC_2_PAGE).resolves();
            executeCommandStub.withArgs(ExtensionCommands.TEARDOWN_FABRIC, undefined, true, v1AnsibleLocal.name, true).resolves();

            hasPreReqsInstalledStub.resolves(true);
            registerPreActivationCommandsStub.resolves(context);
            createTempCommandsStub.returns(undefined);

            const extensionData: ExtensionData = DEFAULT_EXTENSION_DATA;
            extensionData.preReqPageShown = true;
            extensionData.dockerForWindows = true;
            extensionData.version = '1.0.6';
            extensionData.generatorVersion = dependencies['generator-fabric'];
            extensionData.migrationCheck = 2;
            extensionData.createOneOrgLocalFabric = true;
            extensionData.deletedOneOrgLocalFabric = false;

            const showInformationMessageStub: sinon.SinonStub = mySandBox.stub(vscode.window, 'showInformationMessage').resolves('Learn more');

            await GlobalState.update(extensionData);

            await myExtension.activate(context);

            sendTelemetryStub.should.have.been.calledWith('updatedInstall', { IBM: sinon.match.string });

            logSpy.should.have.been.calledWith(LogType.INFO, undefined, `Successful teardown of ${v1AnsibleLocal.name} environment.`);
            logSpy.should.have.been.calledWith(LogType.IMPORTANT, undefined, 'Log files can be found by running the `Developer: Open Logs Folder` command from the palette', undefined, true);
            logSpy.should.have.been.calledWith(LogType.INFO, undefined, 'Starting IBM Blockchain Platform Extension');

            showConfirmationWarningMessageStub.should.have.been.calledOnce;
            setExtensionContextStub.should.have.been.calledTwice;
            hasPreReqsInstalledStub.should.not.have.been.called;
            createTempCommandsStub.should.have.been.calledOnceWith(true);
            setupCommandsStub.should.have.been.calledOnce;
            registerPreActivationCommandsStub.should.have.been.calledOnce;
            executeCommandStub.should.have.been.calledWith(ExtensionCommands.TEARDOWN_FABRIC, undefined, true, v1AnsibleLocal.name, true);

            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.OPEN_PRE_REQ_PAGE);
            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.DELETE_ENVIRONMENT);
            completeActivationStub.should.have.been.calledOnce;

            showInformationMessageStub.should.have.been.calledOnce;
            executeCommandStub.should.have.been.calledWith(ExtensionCommands.OPEN_FABRIC_2_PAGE);

        });

        it(`should log error if teardown of old v1 ansible local environments fails when major extension version has been updated`, async () => {
            const releaseNotesPath: string = path.join(ExtensionUtil.getExtensionPath(), 'RELEASE-NOTES.md');
            const releaseNotesUri: vscode.Uri = vscode.Uri.file(releaseNotesPath);

            const v1AnsibleLocal: FabricEnvironmentRegistryEntry = new FabricEnvironmentRegistryEntry({name: 'v1Ansible', environmentType: EnvironmentType.MANAGED, environmentDirectory: '/some/path'});
            const getAllEnvironmentsStub: sinon.SinonStub = mySandBox.stub(FabricEnvironmentRegistry.instance(), 'getAll');
            getAllEnvironmentsStub.onFirstCall().resolves([v1AnsibleLocal]);
            getAllEnvironmentsStub.onSecondCall().resolves([]);
            showConfirmationWarningMessageStub.resolves(true);

            await vscode.workspace.getConfiguration().update(SettingConfigurations.EXTENSION_BYPASS_PREREQS, true, vscode.ConfigurationTarget.Global);
            setupCommandsStub.resolves();
            completeActivationStub.resolves();
            const context: vscode.ExtensionContext = GlobalState.getExtensionContext();
            setExtensionContextStub.returns(undefined);
            const executeCommandStub: sinon.SinonStub = mySandBox.stub(vscode.commands, 'executeCommand');
            executeCommandStub.callThrough();
            executeCommandStub.withArgs('markdown.showPreview', releaseNotesUri).resolves();
            executeCommandStub.withArgs(ExtensionCommands.OPEN_FABRIC_2_PAGE).resolves();
            executeCommandStub.withArgs(ExtensionCommands.TEARDOWN_FABRIC, undefined, true, v1AnsibleLocal.name, true).rejects('some error');

            hasPreReqsInstalledStub.resolves(true);
            registerPreActivationCommandsStub.resolves(context);
            createTempCommandsStub.returns(undefined);

            const extensionData: ExtensionData = DEFAULT_EXTENSION_DATA;
            extensionData.preReqPageShown = true;
            extensionData.dockerForWindows = true;
            extensionData.version = '1.0.6';
            extensionData.generatorVersion = dependencies['generator-fabric'];
            extensionData.migrationCheck = 2;
            extensionData.createOneOrgLocalFabric = true;
            extensionData.deletedOneOrgLocalFabric = false;

            const showInformationMessageStub: sinon.SinonStub = mySandBox.stub(vscode.window, 'showInformationMessage').resolves('Learn more');

            await GlobalState.update(extensionData);

            await myExtension.activate(context);

            sendTelemetryStub.should.have.been.calledWith('updatedInstall', { IBM: sinon.match.string });

            logSpy.should.have.been.calledWith(LogType.ERROR, undefined, `Unable to teardown ${v1AnsibleLocal.name} environment: some error.`);
            logSpy.should.have.been.calledWith(LogType.IMPORTANT, undefined, 'Log files can be found by running the `Developer: Open Logs Folder` command from the palette', undefined, true);
            logSpy.should.have.been.calledWith(LogType.INFO, undefined, 'Starting IBM Blockchain Platform Extension');

            showConfirmationWarningMessageStub.should.have.been.calledOnce;
            setExtensionContextStub.should.have.been.calledTwice;
            hasPreReqsInstalledStub.should.not.have.been.called;
            createTempCommandsStub.should.have.been.calledOnceWith(true);
            setupCommandsStub.should.have.been.calledOnce;
            registerPreActivationCommandsStub.should.have.been.calledOnce;
            executeCommandStub.should.have.been.calledWith(ExtensionCommands.TEARDOWN_FABRIC, undefined, true, v1AnsibleLocal.name, true);

            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.OPEN_PRE_REQ_PAGE);
            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.DELETE_ENVIRONMENT);
            completeActivationStub.should.have.been.calledOnce;

            showInformationMessageStub.should.have.been.calledOnce;
            executeCommandStub.should.have.been.calledWith(ExtensionCommands.OPEN_FABRIC_2_PAGE);

        });

        it(`should not ask user if they want to teardown old (v1 extension) local ansible environments if none present when major extension version has been updated`, async () => {
            const releaseNotesPath: string = path.join(ExtensionUtil.getExtensionPath(), 'RELEASE-NOTES.md');
            const releaseNotesUri: vscode.Uri = vscode.Uri.file(releaseNotesPath);

            const v1OpsTools: FabricEnvironmentRegistryEntry = new FabricEnvironmentRegistryEntry({name: 'v1Ansible', environmentType: 3 as EnvironmentType, environmentDirectory: '/some/path'});
            const getAllEnvironmentsStub: sinon.SinonStub = mySandBox.stub(FabricEnvironmentRegistry.instance(), 'getAll');
            getAllEnvironmentsStub.onFirstCall().resolves([v1OpsTools]);
            getAllEnvironmentsStub.onSecondCall().resolves([]);

            await vscode.workspace.getConfiguration().update(SettingConfigurations.EXTENSION_BYPASS_PREREQS, true, vscode.ConfigurationTarget.Global);
            setupCommandsStub.resolves();
            completeActivationStub.resolves();
            const context: vscode.ExtensionContext = GlobalState.getExtensionContext();
            setExtensionContextStub.returns(undefined);
            const executeCommandStub: sinon.SinonStub = mySandBox.stub(vscode.commands, 'executeCommand');
            executeCommandStub.callThrough();
            executeCommandStub.withArgs('markdown.showPreview', releaseNotesUri).resolves();
            executeCommandStub.withArgs(ExtensionCommands.OPEN_FABRIC_2_PAGE).resolves();
            hasPreReqsInstalledStub.resolves(true);
            registerPreActivationCommandsStub.resolves(context);
            createTempCommandsStub.returns(undefined);

            const extensionData: ExtensionData = DEFAULT_EXTENSION_DATA;
            extensionData.preReqPageShown = true;
            extensionData.dockerForWindows = true;
            extensionData.version = '1.0.6';
            extensionData.generatorVersion = dependencies['generator-fabric'];
            extensionData.migrationCheck = 2;
            extensionData.createOneOrgLocalFabric = true;
            extensionData.deletedOneOrgLocalFabric = false;

            const showInformationMessageStub: sinon.SinonStub = mySandBox.stub(vscode.window, 'showInformationMessage').resolves('Learn more');

            await GlobalState.update(extensionData);

            await myExtension.activate(context);

            sendTelemetryStub.should.have.been.calledWith('updatedInstall', { IBM: sinon.match.string });

            logSpy.should.have.been.calledWith(LogType.IMPORTANT, undefined, 'Log files can be found by running the `Developer: Open Logs Folder` command from the palette', undefined, true);
            logSpy.should.have.been.calledWith(LogType.INFO, undefined, 'Starting IBM Blockchain Platform Extension');

            showConfirmationWarningMessageStub.should.have.not.been.calledOnce;
            setExtensionContextStub.should.have.been.calledTwice;
            hasPreReqsInstalledStub.should.not.have.been.called;
            createTempCommandsStub.should.have.been.calledOnceWith(true);
            setupCommandsStub.should.have.been.calledOnce;
            registerPreActivationCommandsStub.should.have.been.calledOnce;
            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.TEARDOWN_FABRIC, undefined, true, v1OpsTools.name, true);

            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.OPEN_PRE_REQ_PAGE);
            executeCommandStub.should.not.have.been.calledWith(ExtensionCommands.DELETE_ENVIRONMENT);
            completeActivationStub.should.have.been.calledOnce;

            showInformationMessageStub.should.have.been.calledOnce;
            executeCommandStub.should.have.been.calledWith(ExtensionCommands.OPEN_FABRIC_2_PAGE);

        });

    });

    describe('deactivate', () => {
        it('should deactivate extension', async () => {
            const context: vscode.ExtensionContext = GlobalState.getExtensionContext();

            const getExtensionContextStub: sinon.SinonStub = mySandBox.stub(GlobalState, 'getExtensionContext').returns(context);
            const disposeExtensionStub: sinon.SinonStub = mySandBox.stub(ExtensionUtil, 'disposeExtension').returns(undefined);

            await myExtension.deactivate();

            getExtensionContextStub.should.have.been.calledOnce;
            reporterDisposeStub.should.have.been.calledOnce;
            disposeExtensionStub.should.have.been.calledOnceWithExactly(context);
        });
    });

    describe('txdata files', () => {
        it('should associate .txdata files with JSON language', async () => {
            getPackageJSONStub.callThrough();
            const packageJSON: any = ExtensionUtil.getPackageJSON();
            const languages: Array<{id: string, extensions: string[]}> = packageJSON.contributes.languages;
            languages.should.deep.equal([{
                id: 'json',
                extensions: ['.txdata']
            }]);
        });

        it('should associate a schema with .txdata files for validation', async () => {
            getPackageJSONStub.callThrough();
            const packageJSON: any = ExtensionUtil.getPackageJSON();
            const jsonValidation: Array<{fileMatch: string, url: string}> = packageJSON.contributes.jsonValidation;
            jsonValidation.should.deep.equal([{
                fileMatch: '*.txdata',
                url: './txdata.schema.json'
            }]);
        });
    });
});

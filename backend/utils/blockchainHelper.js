// utils/blockchainHelper.js
const { Gateway, Wallets } = require('fabric-network');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

class BlockchainHelper {
  constructor() {
    this.gateway = null;
    this.contract = null;
    this.network = null;
    this.channelName = 'legaldocs';
    this.chaincodeName = 'legaldocuments';
  }

  // Initialize blockchain connection
  async initialize() {
    try {
      // Load connection profile
      const ccpPath = path.resolve(__dirname, '..', 'blockchain', 'connection-org1.json');
      const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

      // Create wallet and check for user identity
      const walletPath = path.resolve(__dirname, '..', 'blockchain', 'wallet');
      const wallet = await Wallets.newFileSystemWallet(walletPath);

      const identity = await wallet.get('appUser');
      if (!identity) {
        throw new Error('User identity not found in wallet. Please enroll the user first.');
      }

      // Create gateway
      this.gateway = new Gateway();
      await this.gateway.connect(ccp, {
        wallet,
        identity: 'appUser',
        discovery: { enabled: true, asLocalhost: true }
      });

      // Get network and contract
      this.network = await this.gateway.getNetwork(this.channelName);
      this.contract = this.network.getContract(this.chaincodeName);

      console.log('✅ Blockchain connection initialized');
      return true;
    } catch (error) {
      console.error('❌ Blockchain initialization failed:', error);
      throw new Error(`Blockchain initialization failed: ${error.message}`);
    }
  }

  // Create document hash
  createDocumentHash(documentBuffer, metadata = {}) {
    const hash = crypto.createHash('sha256');
    hash.update(documentBuffer);
    
    if (metadata.title) hash.update(metadata.title);
    if (metadata.judgeId) hash.update(metadata.judgeId.toString());
    if (metadata.timestamp) hash.update(metadata.timestamp.toString());
    
    return hash.digest('hex');
  }

  // Store document on blockchain
  async storeDocument(documentData) {
    try {
      if (!this.contract) {
        await this.initialize();
      }

      const {
        documentId,
        documentHash,
        judgeId,
        title,
        category,
        caseNumber,
        accessLevel,
        authorizedLawyers = []
      } = documentData;

      const timestamp = new Date().toISOString();

      // Create blockchain record
      const result = await this.contract.submitTransaction(
        'CreateDocument',
        documentId.toString(),
        documentHash,
        judgeId.toString(),
        title,
        category,
        caseNumber || '',
        accessLevel,
        JSON.stringify(authorizedLawyers),
        timestamp
      );

      const transactionId = result.toString();

      console.log('✅ Document stored on blockchain:', transactionId);
      return {
        success: true,
        transactionId,
        documentHash,
        timestamp
      };

    } catch (error) {
      console.error('❌ Blockchain storage error:', error);
      throw new Error(`Failed to store document on blockchain: ${error.message}`);
    }
  }

  // Verify document integrity
  async verifyDocument(documentId, documentHash) {
    try {
      if (!this.contract) {
        await this.initialize();
      }

      const result = await this.contract.evaluateTransaction(
        'GetDocument',
        documentId.toString()
      );

      const document = JSON.parse(result.toString());

      const isValid = document.documentHash === documentHash;

      return {
        success: true,
        isValid,
        blockchainHash: document.documentHash,
        providedHash: documentHash,
        document: document
      };

    } catch (error) {
      console.error('❌ Document verification error:', error);
      throw new Error(`Failed to verify document: ${error.message}`);
    }
  }

  // Authorize lawyer access
  async authorizeAccess(documentId, lawyerId, judgeId) {
    try {
      if (!this.contract) {
        await this.initialize();
      }

      await this.contract.submitTransaction(
        'AuthorizeLawyer',
        documentId.toString(),
        lawyerId.toString(),
        judgeId.toString(),
        new Date().toISOString()
      );

      console.log('✅ Lawyer access authorized on blockchain');
      return { success: true };

    } catch (error) {
      console.error('❌ Authorization error:', error);
      throw new Error(`Failed to authorize access: ${error.message}`);
    }
  }

  // Check if lawyer is authorized
  async checkAccess(documentId, lawyerId) {
    try {
      if (!this.contract) {
        await this.initialize();
      }

      const result = await this.contract.evaluateTransaction(
        'CheckAccess',
        documentId.toString(),
        lawyerId.toString()
      );

      const accessData = JSON.parse(result.toString());

      return {
        success: true,
        isAuthorized: accessData.authorized,
        authorizedAt: accessData.timestamp,
        authorizedBy: accessData.judgeId
      };

    } catch (error) {
      console.error('❌ Access check error:', error);
      throw new Error(`Failed to check access: ${error.message}`);
    }
  }

  // Get document history
  async getDocumentHistory(documentId) {
    try {
      if (!this.contract) {
        await this.initialize();
      }

      const result = await this.contract.evaluateTransaction(
        'GetDocumentHistory',
        documentId.toString()
      );

      const history = JSON.parse(result.toString());

      return {
        success: true,
        history: history.map(record => ({
          transactionId: record.txId,
          timestamp: record.timestamp,
          action: record.action,
          userId: record.userId,
          details: record.details
        }))
      };

    } catch (error) {
      console.error('❌ History retrieval error:', error);
      throw new Error(`Failed to get document history: ${error.message}`);
    }
  }

  // Get all documents for a judge
  async getJudgeDocuments(judgeId) {
    try {
      if (!this.contract) {
        await this.initialize();
      }

      const result = await this.contract.evaluateTransaction(
        'GetDocumentsByJudge',
        judgeId.toString()
      );

      const documents = JSON.parse(result.toString());

      return {
        success: true,
        documents: documents.map(doc => ({
          documentId: doc.documentId,
          title: doc.title,
          category: doc.category,
          caseNumber: doc.caseNumber,
          accessLevel: doc.accessLevel,
          createdAt: doc.timestamp,
          authorizedLawyers: JSON.parse(doc.authorizedLawyers || '[]')
        }))
      };

    } catch (error) {
      console.error('❌ Judge documents retrieval error:', error);
      throw new Error(`Failed to get judge documents: ${error.message}`);
    }
  }

  // Log document access
  async logAccess(documentId, userId, action, details = {}) {
    try {
      if (!this.contract) {
        await this.initialize();
      }

      await this.contract.submitTransaction(
        'LogAccess',
        documentId.toString(),
        userId.toString(),
        action,
        JSON.stringify(details),
        new Date().toISOString()
      );

      return { success: true };

    } catch (error) {
      console.error('❌ Access logging error:', error);
      throw new Error(`Failed to log access: ${error.message}`);
    }
  }

  // Revoke lawyer access
  async revokeAccess(documentId, lawyerId, judgeId) {
    try {
      if (!this.contract) {
        await this.initialize();
      }

      await this.contract.submitTransaction(
        'RevokeLawyer',
        documentId.toString(),
        lawyerId.toString(),
        judgeId.toString(),
        new Date().toISOString()
      );

      console.log('✅ Lawyer access revoked on blockchain');
      return { success: true };

    } catch (error) {
      console.error('❌ Access revocation error:', error);
      throw new Error(`Failed to revoke access: ${error.message}`);
    }
  }

  // Update document metadata
  async updateDocument(documentId, updates, judgeId) {
    try {
      if (!this.contract) {
        await this.initialize();
      }

      await this.contract.submitTransaction(
        'UpdateDocument',
        documentId.toString(),
        JSON.stringify(updates),
        judgeId.toString(),
        new Date().toISOString()
      );

      console.log('✅ Document updated on blockchain');
      return { success: true };

    } catch (error) {
      console.error('❌ Document update error:', error);
      throw new Error(`Failed to update document: ${error.message}`);
    }
  }

  // Close blockchain connection
  async disconnect() {
    try {
      if (this.gateway) {
        await this.gateway.disconnect();
        this.gateway = null;
        this.contract = null;
        this.network = null;
        console.log('✅ Blockchain connection closed');
      }
    } catch (error) {
      console.error('❌ Disconnection error:', error);
    }
  }

  // Health check
  async healthCheck() {
    try {
      if (!this.contract) {
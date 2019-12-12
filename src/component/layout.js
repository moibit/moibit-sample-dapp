import React, { Component } from 'react';
import '../App.css';
import { Image, Table, Button, Input, Form } from 'semantic-ui-react';
import MoiBit from '../moibit_logo_transparent.png';
import TableList from './tableList';
import credentials from '../middleware/credentials';
import Instance from '../middleware/web3';
import axios from 'axios';
import ShowModal from './modal';
import Utils from '../middleware/signatureParamsUtil';
class Layout extends Component {
    state = {
        fileList: [],
        file: '',
        accountId: '',
        loading: false,
        fieldReq: false,
        readFileIframe: '',
        fileType: '',
        modalOpen: false,
        fileName: '',
        targetedIndex : 0
    }
    async componentDidMount() {
        let acc = await Instance.web3.eth.getAccounts();
        this.setState({ accountId: acc[0] });
        this.observe();
        axios.defaults.headers.common['api_key'] = credentials.API_KEY;
        axios.defaults.headers.common['api_secret'] = credentials.API_SECRET;

        if (acc[0] === credentials.ADMIN) {
            this.getAdminFiles();
        }
        else {
            this.getUserFiles();
        }
    }

    getUserFiles = async () => {
        let data = await Instance.Config.methods.getList().call({ from: this.state.accountId });
        let actual = [];
        if(data.length !== 0) {
            for (let i = 0; i < data.length; i++) {
                actual.push({
                        Name :  data[i].fileName.split("/")[1],
                        Hash :  data[i].mCID.fileHash,
                        verfiledBoolean : 0
                    });
            }
        }
        this.setState({ fileList: actual });
    }

    getAdminFiles = async () => {
        let response = await axios({
            method: 'post',
            url: credentials.CUSTOM_URL+"/moibit/listfiles",
            data: { path: "/" }
        });
        let data = [];
        if(response.data.data.Entries !== null) {
            for (let i = 0; i < response.data.data.Entries.length; i++) {
                if (response.data.data.Entries[i].Type === 0) {
                    await data.push({
                        Name :  response.data.data.Entries[i].Name,
                        Hash :  response.data.data.Entries[i].Hash,
                        verfiledBoolean : 0
                    });
                }
            }
        }
        this.setState({ fileList: data });
    }

    handleSubmit = async (e) => {
        e.preventDefault();
        if (this.state.file !== "") {
            let formData = new FormData();
            formData.append('file', this.state.file);
            formData.append('fileName', '/' + this.state.file.name);
            this.setState({ loading: true });

            let response = await axios({
                method: 'post',
                url: credentials.CUSTOM_URL+"/moibit/writefile",
                data: formData
            });
            const actualFileName = credentials.API_KEY + "" + response.data.data.Path + "" + response.data.data.Name;
            Utils.getSignature(response.data.data.Hash,this.state.accountId,async (signature) => {
                await Instance.Config.methods.addMoiBitFileRecord(actualFileName,response.data.data.Hash,signature).send({ from: this.state.accountId });
                if (this.state.accountId === credentials.ADMIN) {
                    this.getAdminFiles();
                    this.setState({ loading: false });
                }
                else {
                    this.getUserFiles();
                    this.setState({ loading: false });
                }
                this.setState({ loading: false });
            });
        }
        else {
            this.setState({ fieldReq: true })
        }
    }

    observe = async () => {
        try {
            setTimeout(this.observe, 1000);
            const accounts = await Instance.web3.eth.getAccounts();
            if (accounts[0] === this.state.accountId) {

            }
            else {
                window.location = "/";
            }
            return;
        }
        catch (error) {
            console.log(error.message);
        }
    }

    readFile = async (filehash, fileName,validBoolean) => {
        let updatedFilesState = this.state.fileList;
        if(validBoolean) {
            var responseType = '';
            if (fileName.substr(-2, 2) === "sh" || fileName.substr(-3, 3) === "txt" || fileName.substr(-3, 3) === "csv" || fileName.substr(-3, 3) === "php" || fileName.substr(-3, 3) === "html" || fileName.substr(-2, 2) === "js") {
                responseType = '';
            }
            else {
                responseType = 'blob';
            }
            const url = credentials.CUSTOM_URL+'/moibit/readfilebyhash';
            axios({
                method: 'post',
                url: url,
                responseType: responseType,
                data: {
                    hash: filehash
                }
            })
            .then(response => {
                updatedFilesState[this.state.targetedIndex] = {
                    Name :  fileName,
                    Hash :  filehash,
                    verfiledBoolean : 1
                }
                if (typeof (response.data) == "string") {
                    this.setState({ readFileIframe: response.data,
                        fileType: response.headers['content-type'],
                        fileName: fileName,
                        modalOpen: true
                    });
                }
                else {
                    this.setState({
                        readFileIframe: window.URL.createObjectURL(new Blob([response.data], {type:response.headers['content-type']})),
                        fileType: response.headers['content-type'],
                        fileName: fileName,
                        modalOpen: true 
                    })
                }
            })
            .catch(error => {
                console.log(error);
            });
        }
        else {
            updatedFilesState[this.state.targetedIndex] = {
                Name :  fileName,
                Hash :  filehash,
                verfiledBoolean : -1
            }
            this.setState({ 
                            readFileIframe: "You are not authorized to see this file",
                            fileType: 'text/plain',
                            fileName: 'Alert!',
                            modalOpen: true
                        });
        }
        this.setState({fileList : updatedFilesState})
    }

    verifyAndRead = async (signedFileHash, fileName,fileHash) => {
        let currentFilesState = this.state.fileList;
        const currentFile = currentFilesState.filter(f => f['Hash'] === fileHash);
        const targetedIndex = currentFilesState.indexOf(currentFile[0]);
        currentFilesState[targetedIndex] = {
            Name :  fileName,
            Hash :  fileHash,
            verfiledBoolean : 2
        }
        this.setState({ fileList : currentFilesState , targetedIndex : targetedIndex });
        Utils.verifyReceipent(signedFileHash,fileHash,this.state.accountId,(bool) => {
            this.readFile(fileHash,fileName,bool)
        })
    }   

    modalClose = () => {
        this.setState({ modalOpen: false });
    }
    render() {
        const custom_header = {
            backgroundColor: '#222222',
            color: '#fbfbfb',
            border: '1px solid #fbfbfb'
        }
        return (
            <div className="layoutBG">
                {this.state.fileName !== '' ? <ShowModal modalOpen={this.state.modalOpen}
                    modalClose={this.modalClose}
                    fileType={this.state.fileType}
                    responseData={this.state.readFileIframe}
                    fileName={this.state.fileName}
                /> : null}
                <div style={{ display: 'flex', color: '#fbfbfb', marginLeft: '42vw' }}>
                    <Image src={MoiBit} height="60px" width="160px" />
                    {/* <h3 style={{ marginTop: '10px', fontSize: '26px' }}>MoiBit</h3> */}
                </div>
                <div className="table_body_scrollable">
                    <Form onSubmit={(event) => this.handleSubmit(event)} encType="multipart/form-data">
                        <Table celled size="small" style={{ marginTop: '20px', marginBottom: '40px', background: '#f2f2f2', color: '#222222' }}>
                            <Table.Header>
                                <Table.Row>

                                    <Table.HeaderCell style={custom_header}>
                                        <Table.Row>
                                            <Table.Cell textAlign="center" colSpan='2'>
                                                <Input type="file" onChange={(e) => {
                                                    this.setState({ file: e.target.files[0] });
                                                }} required name="file" style={this.state.fieldReq ? { border: '2px solid red', borderRadius: '5px' } : {}} />
                                            </Table.Cell>
                                        </Table.Row>
                                        <Table.Row>
                                            <Table.Cell colSpan='2' textAlign="center" >
                                                <Button primary type="submit" loading={this.state.loading} disabled={this.state.loading} >Submit</Button>
                                            </Table.Cell>
                                        </Table.Row>
                                    </Table.HeaderCell>

                                    <Table.HeaderCell style={custom_header}>
                                        <Table.Row>
                                            <Table.Cell colSpan='2'>
                                                API_KEY : {credentials.API_KEY}
                                            </Table.Cell>
                                        </Table.Row>
                                        <Table.Row>
                                            <Table.Cell colSpan='2'>
                                                <div style={{ wordWrap: 'break-word', width: '600px' }}>
                                                    API_SECRET : {credentials.API_SECRET}
                                                </div>
                                            </Table.Cell>
                                        </Table.Row>
                                    </Table.HeaderCell>
                                </Table.Row>
                            </Table.Header>
                        </Table>
                    </Form>
                    <div className="content-container">
                        <TableList fileList={this.state.fileList} readFile={this.verifyAndRead}
                        />

                    </div>
                </div>
            </div>
        );
    }
}
export default Layout;